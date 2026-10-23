/**
 * Types shared between the cluster frame (renderer), the main process and the pop-out window.
 * This module must stay free of any Lens / Electron / React imports.
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "unknown"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LEVEL_LABELS: Record<LogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  fatal: "FATAL",
  unknown: "?",
};

/** One logical log entry (possibly several physical lines merged, e.g. a stack trace). */
export interface LogLine {
  /** Monotonic id assigned by the session. */
  id: number;
  /** Timestamp reported by Kubernetes (ms since epoch) or null when missing. */
  ts: number | null;
  /** Key of the {@link SourceInfo} this line belongs to. */
  source: string;
  /** Message text without the Kubernetes timestamp prefix. */
  text: string;
  level: LogLevel;
}

export interface SourceInfo {
  /** `${pod}/${container}` */
  key: string;
  pod: string;
  container: string;
  isInit: boolean;
  enabled: boolean;
  colorIdx: number;
  error: string | null;
  podPhase: string | null;
}

export const TARGET_KINDS = ["Pod", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export interface SessionMeta {
  title: string;
  subtitle: string;
  kind: TargetKind;
  namespace: string;
  sources: SourceInfo[];
  previous: boolean;
  /** null means "all lines". */
  tailLines: number | null;
  /** null means "no time limit". */
  sinceSeconds: number | null;
  paused: boolean;
  loading: boolean;
  error: string | null;
  maxLines: number;
  pollIntervalMs: number;
}

export type FilterRuleMode = "include" | "exclude" | "highlight";

export interface FilterRule {
  id: string;
  name: string;
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
  mode: FilterRuleMode;
  color: string;
  enabled: boolean;
}

export type SearchMode = "filter" | "highlight";

export interface SearchState {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  invert: boolean;
  mode: SearchMode;
}

export interface FilterState {
  levels: Record<LogLevel, boolean>;
  search: SearchState;
  rules: FilterRule[];
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
  updatedAt: number;
}

export interface Settings {
  pollIntervalMs: number;
  /** 0 means "all lines". */
  defaultTailLines: number;
  maxBufferLines: number;
  mergeMultiline: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMs: 1500,
  defaultTailLines: 1000,
  maxBufferLines: 50000,
  mergeMultiline: true,
};

/** Controls sent by a viewer to the session that owns the data. */
export type SessionControl =
  | { type: "toggleSource"; key: string; enabled: boolean }
  | { type: "setAllSources"; enabled: boolean }
  | { type: "setPrevious"; previous: boolean }
  | { type: "setRange"; tailLines: number | null; sinceSeconds: number | null }
  | { type: "setPaused"; paused: boolean }
  | { type: "clear" }
  | { type: "reload" }
  | { type: "savePresets"; presets: FilterPreset[] }
  | { type: "openPopout" };

/** Events emitted by a session towards every attached viewer. */
export type FeedEvent =
  | { type: "snapshot"; lines: LogLine[]; meta: SessionMeta; presets: FilterPreset[] }
  | { type: "append"; lines: LogLine[] }
  | { type: "update"; id: number; text: string; level: LogLevel }
  | { type: "clear" }
  | { type: "meta"; meta: SessionMeta }
  | { type: "presets"; presets: FilterPreset[] }
  | { type: "tick"; at: number };

/** CSS variables of the Lens theme forwarded to the pop-out window. */
export type ThemeVars = Record<string, string>;
