import { dump, load } from "js-yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { format as formatSql } from "sql-formatter";
import formatXml from "xml-formatter";
import type { PayloadCandidate, PayloadKind } from "./detect-format";
import { findCandidates, tryParseJson } from "./detect-format";

export type HighlightLang = "json" | "xml" | "yaml" | "ini" | "sql";

export interface Payload {
  kind: PayloadKind;
  label: string;
  lang: HighlightLang;
  start: number;
  end: number;
  raw: string;
  pretty: string;
}

const KIND_LABELS: Record<PayloadKind, string> = {
  json: "JSON",
  xml: "XML",
  yaml: "YAML",
  toml: "TOML",
  logfmt: "logfmt",
  sql: "SQL",
};

const KIND_LANGS: Record<PayloadKind, HighlightLang> = {
  json: "json",
  xml: "xml",
  yaml: "yaml",
  toml: "ini",
  logfmt: "ini",
  sql: "sql",
};

const MAX_NESTED_DEPTH = 3;
const CACHE_LIMIT = 3000;
const CACHE_MAX_KEY_LENGTH = 20000;

/** Replaces string values that contain JSON objects/arrays by the parsed structure. */
export function expandNestedJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_NESTED_DEPTH) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length > 1 && (trimmed[0] === "{" || trimmed[0] === "[")) {
      const parsed = tryParseJson(trimmed);

      return parsed === undefined ? value : expandNestedJson(parsed, depth + 1);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => expandNestedJson(item, depth));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandNestedJson(item, depth)]));
  }

  return value;
}

export function formatJson(raw: string): string | null {
  const value = tryParseJson(raw);

  return value === undefined ? null : JSON.stringify(expandNestedJson(value), null, 2);
}

export function formatXmlText(raw: string): string {
  return formatXml(raw, { indentation: "  ", collapseContent: true, lineSeparator: "\n" });
}

export function formatYamlText(raw: string): string | null {
  const value = load(dedent(raw));

  if (typeof value !== "object" || value === null) {
    return null;
  }

  return dump(value, { indent: 2, lineWidth: 120, noRefs: true }).trimEnd();
}

export function formatTomlText(raw: string): string | null {
  const value = parseToml(dedent(raw));

  return Object.keys(value).length > 0 ? stringifyToml(value).trimEnd() : null;
}

export function formatSqlText(raw: string): string {
  return formatSql(raw, { language: "sql", tabWidth: 2, keywordCase: "upper" });
}

function unquoteLogfmtValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

export function formatLogfmt(raw: string): string | null {
  const pairs: Array<[string, string]> = [];
  const pattern = /(?:^|\s)([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;
  let match = pattern.exec(raw);

  while (match) {
    pairs.push([match[1], unquoteLogfmtValue(match[2])]);
    match = pattern.exec(raw);
  }

  if (pairs.length === 0) {
    return null;
  }

  const width = Math.max(...pairs.map(([key]) => key.length));

  return pairs.map(([key, value]) => `${key.padEnd(width)} = ${value}`).join("\n");
}

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter(line => line.trim().length > 0).map(line => /^\s*/.exec(line)?.[0].length ?? 0);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;

  return indent > 0 ? lines.map(line => line.slice(indent)).join("\n") : text;
}

function prettify(candidate: PayloadCandidate): string | null {
  switch (candidate.kind) {
    case "json":
      return formatJson(candidate.raw);
    case "xml":
      return formatXmlText(candidate.raw);
    case "yaml":
      return formatYamlText(candidate.raw);
    case "toml":
      return formatTomlText(candidate.raw);
    case "logfmt":
      return formatLogfmt(candidate.raw);
    case "sql":
      return formatSqlText(candidate.raw);
    default: {
      const unreachable: never = candidate.kind;

      throw new Error(`Unhandled payload kind: ${String(unreachable)}`);
    }
  }
}

/** Formats every candidate and drops those that fail to parse. */
export function buildPayloads(text: string): Payload[] {
  const payloads: Payload[] = [];

  for (const candidate of findCandidates(text)) {
    try {
      const pretty = prettify(candidate);

      if (pretty !== null && pretty.trim().length > 0) {
        payloads.push({
          kind: candidate.kind,
          label: KIND_LABELS[candidate.kind],
          lang: KIND_LANGS[candidate.kind],
          start: candidate.start,
          end: candidate.end,
          raw: candidate.raw,
          pretty,
        });
      }
    } catch {
      // the region is not valid for the guessed format, ignore it
    }
  }

  return payloads;
}

const cache = new Map<string, Payload[]>();

/** Cached variant of {@link buildPayloads}; rows are re-rendered often while scrolling. */
export function detectPayloads(text: string): Payload[] {
  const cached = cache.get(text);

  if (cached) {
    return cached;
  }

  const payloads = buildPayloads(text);

  if (text.length > CACHE_MAX_KEY_LENGTH) {
    return payloads;
  }

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();

    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }

  cache.set(text, payloads);

  return payloads;
}
