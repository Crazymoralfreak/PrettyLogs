export const PAYLOAD_KINDS = ["json", "xml", "yaml", "toml", "logfmt", "sql"] as const;
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];

/** A region of a log message that looks like structured data. It is not validated for yaml/toml yet. */
export interface PayloadCandidate {
  kind: PayloadKind;
  start: number;
  end: number;
  raw: string;
}

const MAX_TEXT_LENGTH = 300000;
const MAX_JSON_CANDIDATES = 5;
const MAX_BRACKET_STARTS = 20;

const CLOSERS: Record<string, string> = { "{": "}", "[": "]" };

/** Returns the index just after the bracket that closes the one at `start`, or -1. */
export function matchBracket(text: string, start: number): number {
  const stack: string[] = [];

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      i = skipJsonString(text, i);

      if (i === -1) {
        return -1;
      }

      continue;
    }

    const closer = CLOSERS[ch];

    if (closer) {
      stack.push(closer);
    } else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) {
        return -1;
      }

      if (stack.length === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}

/** Returns the index of the closing quote of the JSON string starting at `start`, or -1. */
function skipJsonString(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\\") {
      i++;
    } else if (ch === '"') {
      return i;
    } else if (ch === "\n") {
      return -1;
    }
  }

  return -1;
}

function unescapeQuotes(raw: string): string {
  return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Parses a JSON object/array, also accepting a payload whose quotes were backslash-escaped by a logger. */
export function tryParseJson(raw: string): unknown | undefined {
  for (const variant of raw.includes('\\"') ? [raw, unescapeQuotes(raw)] : [raw]) {
    try {
      const value: unknown = JSON.parse(variant);

      if (typeof value === "object" && value !== null) {
        return value;
      }
    } catch {
      // not JSON, try the next variant
    }
  }

  return undefined;
}

function isMeaningfulJson(raw: string, value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && raw.length >= 7;
  }

  return Object.keys(value as Record<string, unknown>).length > 0;
}

export function findJsonCandidates(text: string): PayloadCandidate[] {
  const result: PayloadCandidate[] = [];
  let attempts = 0;
  let cursor = 0;

  while (cursor < text.length && result.length < MAX_JSON_CANDIDATES && attempts < MAX_BRACKET_STARTS) {
    const open = text.slice(cursor).search(/[{[]/);

    if (open === -1) {
      break;
    }

    const start = cursor + open;
    const end = matchBracket(text, start);

    attempts++;

    if (end === -1) {
      cursor = start + 1;
      continue;
    }

    const raw = text.slice(start, end);
    const value = tryParseJson(raw);

    if (value !== undefined && isMeaningfulJson(raw, value)) {
      result.push({ kind: "json", start, end, raw });
      cursor = end;
    } else {
      cursor = start + 1;
    }
  }

  return result;
}

const XML_OPEN_TAG = /<([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?(\/?)>/g;
const XML_DECLARATION_BEFORE = /<\?xml[^>]*\?>\s*$/;

export function findXmlCandidate(text: string): PayloadCandidate | null {
  XML_OPEN_TAG.lastIndex = 0;

  let match = XML_OPEN_TAG.exec(text);

  while (match) {
    const [openTag, name, selfClosing] = match;
    let end = -1;

    if (selfClosing) {
      end = match.index + openTag.length;
    } else {
      const closeTag = `</${name}>`;
      const closeIndex = text.lastIndexOf(closeTag);

      if (closeIndex > match.index) {
        end = closeIndex + closeTag.length;
      }
    }

    if (end !== -1) {
      const declaration = XML_DECLARATION_BEFORE.exec(text.slice(0, match.index));
      const start = declaration ? declaration.index : match.index;

      return { kind: "xml", start, end, raw: text.slice(start, end) };
    }

    match = XML_OPEN_TAG.exec(text);
  }

  return null;
}

const YAML_KEY_LINE = /^\s*(?:-\s+)?[\w"'./-][^:\n]*:(?:\s|$)/;
const YAML_LIST_LINE = /^\s*-\s+\S/;
const TOML_SECTION_LINE = /^\s*\[{1,2}[\w."' -]+\]{1,2}\s*$/;
const TOML_KEY_LINE = /^\s*[\w."'-]+\s*=\s*\S/;

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter(line => line.trim().length > 0);
}

function ratio(lines: string[], predicate: (line: string) => boolean): number {
  return lines.filter(predicate).length / lines.length;
}

function candidateFromLines(kind: PayloadKind, text: string, firstLine: number): PayloadCandidate {
  const lines = text.split("\n");
  const start = lines.slice(0, firstLine).reduce((offset, line) => offset + line.length + 1, 0);

  return { kind, start, end: text.length, raw: text.slice(start) };
}

/** Looks for a multi-line YAML or TOML block that starts on the first or the second line. */
export function findBlockCandidate(text: string): PayloadCandidate | null {
  if (!text.includes("\n")) {
    return null;
  }

  for (const firstLine of [0, 1]) {
    const block = candidateFromLines("yaml", text, firstLine);
    const lines = nonEmptyLines(block.raw);

    if (lines.length < 2) {
      continue;
    }

    const tomlHits = lines.filter(line => TOML_KEY_LINE.test(line) || TOML_SECTION_LINE.test(line)).length;

    if (tomlHits / lines.length >= 0.7 && lines.some(line => TOML_KEY_LINE.test(line))) {
      return { ...block, kind: "toml" };
    }

    const keyLines = lines.filter(line => YAML_KEY_LINE.test(line)).length;

    if (keyLines >= 2 && ratio(lines, line => YAML_KEY_LINE.test(line) || YAML_LIST_LINE.test(line) || /^\s/.test(line)) >= 0.8) {
      return block;
    }
  }

  return null;
}

const LOGFMT_PAIR = /(?:^|\s)([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;

/** Detects a single-line `key=value key2="quoted value"` record. */
export function findLogfmtCandidate(text: string): PayloadCandidate | null {
  if (text.includes("\n") || text.length < 10) {
    return null;
  }

  let pairs = 0;
  let covered = 0;
  let match = LOGFMT_PAIR.exec(text);

  while (match) {
    pairs++;
    covered += match[0].trim().length;
    match = LOGFMT_PAIR.exec(text);
  }

  LOGFMT_PAIR.lastIndex = 0;

  if (pairs < 3 || covered / text.replace(/\s/g, " ").trim().length < 0.5) {
    return null;
  }

  return { kind: "logfmt", start: 0, end: text.length, raw: text };
}

const SQL_UPPERCASE = /\b(?:SELECT\b[\s\S]+?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[\w."`]+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b)/;
const SQL_ANY_CASE_AT_START = /^\s*(?:select\b[\s\S]+?\bfrom\b|insert\s+into\b|update\s+[\w."`]+\s+set\b|delete\s+from\b|with\s+\w+\s+as\s*\()/i;

export function findSqlCandidate(text: string): PayloadCandidate | null {
  let start = -1;

  const atStart = SQL_ANY_CASE_AT_START.exec(text);

  if (atStart) {
    start = atStart.index + (atStart[0].length - atStart[0].trimStart().length);
  } else {
    const inner = SQL_UPPERCASE.exec(text);

    if (inner) {
      start = inner.index;
    }
  }

  if (start === -1) {
    return null;
  }

  let end = text.length;
  const quote = text[start - 1];

  if ((quote === '"' || quote === "'") && text.lastIndexOf(quote) > start) {
    end = text.lastIndexOf(quote);
  }

  return { kind: "sql", start, end, raw: text.slice(start, end) };
}

/** Finds candidate payloads in a log message in priority order. Candidates still need to be formatted (and thereby validated). */
export function findCandidates(text: string): PayloadCandidate[] {
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    return [];
  }

  const candidates: PayloadCandidate[] = findJsonCandidates(text);

  if (candidates.length > 0) {
    return candidates;
  }

  const xml = findXmlCandidate(text);

  if (xml) {
    candidates.push(xml);
  }

  const block = findBlockCandidate(text);

  if (block) {
    candidates.push(block);
  }

  const logfmt = findLogfmtCandidate(text);

  if (logfmt) {
    candidates.push(logfmt);
  }

  const sql = findSqlCandidate(text);

  if (sql) {
    candidates.push(sql);
  }

  return candidates;
}
