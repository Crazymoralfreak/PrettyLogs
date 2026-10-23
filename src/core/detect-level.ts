import type { LogLevel } from "../common/types";

const SCAN_LIMIT = 400;

const NAMED_LEVELS: Record<string, LogLevel> = {
  trace: "trace",
  trc: "trace",
  verbose: "trace",
  finest: "trace",
  finer: "trace",
  silly: "trace",
  debug: "debug",
  dbg: "debug",
  fine: "debug",
  info: "info",
  inf: "info",
  information: "info",
  informational: "info",
  notice: "info",
  warn: "warn",
  wrn: "warn",
  warning: "warn",
  error: "error",
  err: "error",
  severe: "error",
  fatal: "fatal",
  critical: "fatal",
  crit: "fatal",
  panic: "fatal",
  dpanic: "fatal",
  emerg: "fatal",
  emergency: "fatal",
  alert: "fatal",
};

const KLOG_LEVELS: Record<string, LogLevel> = {
  I: "info",
  W: "warn",
  E: "error",
  F: "fatal",
};

const JSON_LEVEL_KEY =
  /"(?:level|lvl|severity|loglevel|log_level|levelname|@l|log\.level)"\s*:\s*(?:"([^"]*)"|(\d+))/i;
const LOGFMT_LEVEL_KEY = /(?:^|\s)(?:level|lvl|severity)=("?)([A-Za-z]+)\1/i;
const KLOG_PREFIX = /^([IWEF])\d{4}\s\d{2}:\d{2}:\d{2}/;
const BRACKETED_LEVEL = /[[<(|]\s*(trace|debug|info|warn|warning|error|err|fatal|critical|panic)\s*[\]>)|]/i;
const UPPERCASE_LEVEL =
  /(?:^|[^A-Za-z0-9_])(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|PANIC|CRITICAL|CRIT|SEVERE)(?![A-Za-z0-9_])/;
const LEADING_WORD_LEVEL = /^(?:\S+\s+){0,2}(info|warn|warning|error|debug|trace|fatal)(?=[:\s\]])/i;

/** Maps a textual or numeric level (pino/bunyan scale for numbers) to a {@link LogLevel}. */
export function normalizeLevel(value: string | number): LogLevel | null {
  if (typeof value === "number") {
    if (value <= 10) {
      return "trace";
    }

    if (value <= 20) {
      return "debug";
    }

    if (value <= 30) {
      return "info";
    }

    if (value <= 40) {
      return "warn";
    }

    return value <= 50 ? "error" : "fatal";
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return normalizeLevel(Number(trimmed));
  }

  return NAMED_LEVELS[trimmed.toLowerCase()] ?? null;
}

function detectByStructuredFields(head: string): LogLevel | null {
  const json = JSON_LEVEL_KEY.exec(head);

  if (json) {
    const level = normalizeLevel(json[1] ?? Number(json[2]));

    if (level) {
      return level;
    }
  }

  const logfmt = LOGFMT_LEVEL_KEY.exec(head);

  if (logfmt) {
    return normalizeLevel(logfmt[2]);
  }

  const klog = KLOG_PREFIX.exec(head);

  return klog ? KLOG_LEVELS[klog[1]] : null;
}

function detectByTokens(head: string): LogLevel | null {
  const bracketed = BRACKETED_LEVEL.exec(head);

  if (bracketed) {
    return normalizeLevel(bracketed[1]);
  }

  const upper = UPPERCASE_LEVEL.exec(head);

  if (upper) {
    return normalizeLevel(upper[1]);
  }

  const leading = LEADING_WORD_LEVEL.exec(head);

  return leading ? normalizeLevel(leading[1]) : null;
}

function detectByHeuristics(text: string, head: string): LogLevel | null {
  if (/^panic:/.test(head) || /^fatal error:/.test(head)) {
    return "fatal";
  }

  if (/^Traceback \(most recent call last\)/.test(head) || /^Exception in thread/.test(head)) {
    return "error";
  }

  if (/\n\s+at\s+\S+\(.*\)/.test(text) || /\n\s+File ".*", line \d+/.test(text)) {
    return "error";
  }

  return null;
}

/** Detects the severity of a log entry. Only the first line is inspected, except for stack-trace heuristics. */
export function detectLevel(text: string): LogLevel {
  const newline = text.indexOf("\n");
  const firstLine = newline === -1 ? text : text.slice(0, newline);
  const head = firstLine.length > SCAN_LIMIT ? firstLine.slice(0, SCAN_LIMIT) : firstLine;

  return detectByStructuredFields(head) ?? detectByTokens(head) ?? detectByHeuristics(text, head) ?? "unknown";
}
