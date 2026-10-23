import type { FeedEvent, FilterPreset, LogLine, SessionControl, SessionMeta } from "../common/types";

/** Everything a viewer needs to render. It is rebuilt from {@link FeedEvent}s. */
export interface FeedState {
  lines: LogLine[];
  meta: SessionMeta | null;
  presets: FilterPreset[];
  /** Time of the last event received from the session (used to detect a lost connection). */
  lastEventAt: number;
}

export type FeedListener = (event: FeedEvent) => void;

/** Source of log data for the viewer: a local session or a remote one reached through IPC. */
export interface LogFeed {
  /** Returns the current state synchronously (may be empty until the first snapshot arrives). */
  getSnapshot(): FeedState;
  subscribe(listener: FeedListener): () => void;
  send(control: SessionControl): void;
  /** True when the viewer may offer a "move to a separate window" action. */
  readonly canPopout: boolean;
  /** When set, the viewer warns if no event arrived within this period. */
  readonly staleAfterMs?: number;
  /** Optional "always on top" control of the hosting window. */
  setWindowPinned?(pinned: boolean): void;
}

export function emptyFeedState(): FeedState {
  return { lines: [], meta: null, presets: [], lastEventAt: Date.now() };
}

const FALLBACK_MAX_LINES = 50000;

function findIndexById(lines: LogLine[], id: number): number {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const current = lines[middle].id;

    if (current === id) {
      return middle;
    }

    if (current < id) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return -1;
}

function trimLines(lines: LogLine[], maxLines: number): LogLine[] {
  return lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;
}

/** Pure reducer applying one session event to the viewer state. */
export function applyFeedEvent(state: FeedState, event: FeedEvent): FeedState {
  const now = Date.now();

  switch (event.type) {
    case "snapshot":
      return { lines: event.lines, meta: event.meta, presets: event.presets, lastEventAt: now };
    case "append": {
      if (event.lines.length === 0) {
        return { ...state, lastEventAt: now };
      }

      const maxLines = state.meta?.maxLines ?? FALLBACK_MAX_LINES;

      return { ...state, lines: trimLines(state.lines.concat(event.lines), maxLines), lastEventAt: now };
    }
    case "update": {
      const index = findIndexById(state.lines, event.id);

      if (index === -1) {
        return { ...state, lastEventAt: now };
      }

      const lines = state.lines.slice();

      lines[index] = { ...lines[index], text: event.text, level: event.level };

      return { ...state, lines, lastEventAt: now };
    }
    case "clear":
      return { ...state, lines: [], lastEventAt: now };
    case "meta":
      return { ...state, meta: event.meta, lastEventAt: now };
    case "presets":
      return { ...state, presets: event.presets, lastEventAt: now };
    case "tick":
      return { ...state, lastEventAt: now };
    default: {
      const unreachable: never = event;

      throw new Error(`Unhandled feed event: ${JSON.stringify(unreachable)}`);
    }
  }
}
