import hljs from "highlight.js/lib/core";
import ini from "highlight.js/lib/languages/ini";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { normalizeLevel } from "./detect-level";
import type { HighlightLang } from "./pretty-format";

hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("sql", sql);

const MAX_HIGHLIGHT_LENGTH = 200000;
const MAX_TOKENIZE_LENGTH = 20000;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Returns safe HTML with highlight.js token classes for the given code. */
export function highlightCode(code: string, lang: HighlightLang): string {
  if (code.length > MAX_HIGHLIGHT_LENGTH) {
    return escapeHtml(code);
  }

  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** A piece of a log message with an optional token class. */
export interface Segment {
  text: string;
  cls: string | null;
}

export interface HighlightRange {
  start: number;
  end: number;
  /** CSS color for rule highlights; undefined for the default search highlight. */
  color?: string;
  kind: "search" | "rule";
  current?: boolean;
}

export interface MarkedSegment extends Segment {
  mark: HighlightRange | null;
}

const TOKEN_PATTERN = new RegExp(
  [
    "(?<ts>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)",
    "(?<url>https?:\\/\\/[^\\s\"'<>)\\]]+)",
    "(?<uuid>\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b)",
    "(?<ip>\\b\\d{1,3}(?:\\.\\d{1,3}){3}(?::\\d{1,5})?\\b)",
    '(?<jkey>"(?:[^"\\\\\\n]|\\\\.)*"(?=\\s*:))',
    '(?<str>"(?:[^"\\\\\\n]|\\\\.)*")',
    "(?<lvl>\\b(?:TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|PANIC|CRITICAL|CRIT|SEVERE)\\b)",
    "(?<kv>\\b[A-Za-z_][\\w.-]*(?==))",
    "(?<num>\\b\\d+(?:\\.\\d+)?(?:ms|us|ns|s|m|h|%|[KMG]i?B)?\\b)",
  ].join("|"),
  "g",
);

const GROUP_CLASSES: Array<[string, string]> = [
  ["ts", "tok-ts"],
  ["url", "tok-url"],
  ["uuid", "tok-uuid"],
  ["ip", "tok-ip"],
  ["jkey", "tok-key"],
  ["str", "tok-str"],
  ["kv", "tok-key"],
  ["num", "tok-num"],
];

function classForMatch(groups: Record<string, string | undefined>): string | null {
  const level = groups.lvl;

  if (level !== undefined) {
    return `tok-lvl tok-lvl-${normalizeLevel(level) ?? "unknown"}`;
  }

  for (const [group, cls] of GROUP_CLASSES) {
    if (groups[group] !== undefined) {
      return cls;
    }
  }

  return null;
}

/** Splits a log message into tokens (time, level, strings, numbers, urls, ...). */
export function tokenizeLogLine(text: string): Segment[] {
  const head = text.length > MAX_TOKENIZE_LENGTH ? text.slice(0, MAX_TOKENIZE_LENGTH) : text;
  const segments: Segment[] = [];
  let cursor = 0;

  TOKEN_PATTERN.lastIndex = 0;

  let match = TOKEN_PATTERN.exec(head);

  while (match) {
    if (match[0].length === 0) {
      TOKEN_PATTERN.lastIndex++;
      match = TOKEN_PATTERN.exec(head);
      continue;
    }

    if (match.index > cursor) {
      segments.push({ text: head.slice(cursor, match.index), cls: null });
    }

    segments.push({ text: match[0], cls: classForMatch(match.groups ?? {}) });
    cursor = match.index + match[0].length;
    match = TOKEN_PATTERN.exec(head);
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), cls: null });
  }

  return segments;
}

/**
 * Overlays highlight ranges on tokenized segments. Later ranges take priority over earlier ones
 * so callers should pass rule ranges first and search ranges last.
 */
export function applyRanges(segments: Segment[], ranges: HighlightRange[]): MarkedSegment[] {
  if (ranges.length === 0) {
    return segments.map(segment => ({ ...segment, mark: null }));
  }

  const result: MarkedSegment[] = [];
  let offset = 0;

  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    const cuts = new Set<number>([segmentStart, segmentEnd]);

    for (const range of ranges) {
      if (range.start > segmentStart && range.start < segmentEnd) {
        cuts.add(range.start);
      }

      if (range.end > segmentStart && range.end < segmentEnd) {
        cuts.add(range.end);
      }
    }

    const points = [...cuts].sort((a, b) => a - b);

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      let mark: HighlightRange | null = null;

      for (const range of ranges) {
        if (range.start <= from && range.end >= to) {
          mark = range;
        }
      }

      result.push({ text: segment.text.slice(from - segmentStart, to - segmentStart), cls: segment.cls, mark });
    }

    offset = segmentEnd;
  }

  return result;
}
