import type { FeedEvent, SessionControl, ThemeVars } from "./types";

/** Channels used through the Lens extension IPC (cluster frame <-> main process). */
export const LENS_CHANNELS = {
  /** invoke: renderer asks the main process to open (or focus) a pop-out window. */
  openPopout: "prettylogs:popout:open",
  /** invoke: renderer forwards a feed event to the pop-out window of a session. */
  sendToPopout: "prettylogs:popout:send",
  /** invoke: renderer closes the pop-out window of a session. */
  closePopout: "prettylogs:popout:close",
  /** broadcast: main process tells cluster frames what happened in a pop-out window. */
  fromPopout: "prettylogs:popout:from",
} as const;

/** Channels used between the pop-out BrowserWindow and the main process (plain Electron IPC). */
export const WINDOW_CHANNELS = {
  /** window -> main */
  message: "prettylogs:window:message",
  /** window -> main */
  setPinned: "prettylogs:window:set-pinned",
  /** main -> window */
  event: "prettylogs:window:event",
} as const;

export interface OpenPopoutRequest {
  sessionId: string;
  title: string;
  theme: ThemeVars;
}

export interface SendToPopoutRequest {
  sessionId: string;
  event: FeedEvent;
}

export type PopoutToHostMessage =
  | { kind: "ready" }
  | { kind: "control"; control: SessionControl }
  | { kind: "closed" };

/** Payload of {@link LENS_CHANNELS.fromPopout}. */
export interface PopoutBroadcast {
  sessionId: string;
  message: PopoutToHostMessage;
}

/** Messages the main process pushes into the pop-out window. */
export type HostToPopoutMessage =
  | { type: "event"; event: FeedEvent }
  | { type: "theme"; theme: ThemeVars };

/** API exposed by the preload script as `window.prettyLogsBridge`. */
export interface PopoutBridge {
  sessionId: string;
  title: string;
  send(message: PopoutToHostMessage): void;
  setPinned(pinned: boolean): void;
  onMessage(listener: (message: HostToPopoutMessage) => void): () => void;
}
