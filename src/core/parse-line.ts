export interface ParsedLine {
  /** Raw RFC3339 timestamp as reported by Kubernetes, or null. */
  rawTs: string | null;
  /** Nanosecond precision sort key, or null. */
  tsKey: bigint | null;
  /** Milliseconds since epoch, or null. */
  ts: number | null;
  text: string;
}

export interface FoldedLines {
  /** Continuation lines found before the first regular entry (they belong to an already emitted entry). */
  leading: ParsedLine[];
  entries: ParsedLine[];
}

const K8S_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})\s/;

const CONTINUATION_PATTERNS: RegExp[] = [
  /^[ \t]+\S/,
  /^Caused by:/,
  /^\.\.\. \d+ (?:more|common frames omitted)/,
  /^[}\])]+[,;]?$/,
  /^goroutine \d+ \[/,
];

/** Splits a raw Kubernetes log payload into physical lines without a trailing empty line. */
export function splitPhysicalLines(body: string): string[] {
  if (!body) {
    return [];
  }

  const lines = body.split(/\r?\n/);

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

/** Parses a single physical line produced with `timestamps=true`. */
export function parseLogLine(line: string): ParsedLine {
  const match = K8S_TIMESTAMP.exec(line);

  if (!match) {
    return { rawTs: null, tsKey: null, ts: null, text: line };
  }

  const [prefix, base, fraction = "", zone] = match;
  const seconds = Date.parse(`${base}${zone}`);

  if (Number.isNaN(seconds)) {
    return { rawTs: null, tsKey: null, ts: null, text: line };
  }

  const nanos = fraction.padEnd(9, "0");
  const millis = Number(nanos.slice(0, 3));

  return {
    rawTs: `${base}${fraction ? `.${fraction}` : ""}${zone}`,
    tsKey: BigInt(Math.floor(seconds / 1000)) * BigInt(1000000000) + BigInt(nanos),
    ts: seconds + millis,
    text: line.slice(prefix.length),
  };
}

export function parseLogBody(body: string): ParsedLine[] {
  return splitPhysicalLines(body).map(parseLogLine);
}

/** True for lines that visually belong to the previous entry (stack traces, pretty-printed payloads). */
export function isContinuationLine(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  return CONTINUATION_PATTERNS.some(pattern => pattern.test(text));
}

function mergeInto(target: ParsedLine, extra: ParsedLine): ParsedLine {
  return { ...target, text: `${target.text}\n${extra.text}` };
}

/**
 * Merges continuation lines into the preceding entry.
 * Empty lines are dropped.
 */
export function foldContinuations(lines: ParsedLine[]): FoldedLines {
  const leading: ParsedLine[] = [];
  const entries: ParsedLine[] = [];

  for (const line of lines) {
    if (line.text.trim().length === 0) {
      continue;
    }

    if (isContinuationLine(line.text)) {
      if (entries.length > 0) {
        entries[entries.length - 1] = mergeInto(entries[entries.length - 1], line);
      } else {
        leading.push(line);
      }

      continue;
    }

    entries.push(line);
  }

  return { leading, entries };
}

/** Joins leading continuation lines into a single entry (used when there is no entry to attach them to). */
export function joinLines(lines: ParsedLine[]): ParsedLine | null {
  if (lines.length === 0) {
    return null;
  }

  return lines.slice(1).reduce(mergeInto, lines[0]);
}

/** Orders two parsed lines by timestamp; lines without a timestamp keep their relative order. */
export function compareTimestampKeys(a: bigint | null, b: bigint | null): number {
  if (a === null || b === null) {
    return 0;
  }

  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}
