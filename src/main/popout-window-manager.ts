import type { WebContents } from "electron";
import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import type { HostToPopoutMessage, OpenPopoutRequest, PopoutBroadcast, PopoutToHostMessage, SendToPopoutRequest } from "../common/ipc-channels";
import { WINDOW_CHANNELS } from "../common/ipc-channels";

interface PopoutWindow {
  sessionId: string;
  window: BrowserWindow;
}

export interface PopoutWindowManagerOptions {
  /** Directory with `popout.html` and `preload.js` (the extension `dist` directory). */
  distDir: string;
  /** Sends a message to every cluster frame. */
  broadcast: (message: PopoutBroadcast) => void;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 760;

/** Creates and routes messages of the pop-out log windows. */
export class PopoutWindowManager {
  private readonly windows = new Map<string, PopoutWindow>();
  private started = false;

  constructor(private readonly options: PopoutWindowManagerOptions) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    ipcMain.on(WINDOW_CHANNELS.message, this.onWindowMessage);
    ipcMain.on(WINDOW_CHANNELS.setPinned, this.onSetPinned);
  }

  stop(): void {
    ipcMain.removeListener(WINDOW_CHANNELS.message, this.onWindowMessage);
    ipcMain.removeListener(WINDOW_CHANNELS.setPinned, this.onSetPinned);
    this.started = false;
    this.closeAll();
  }

  /** Opens a window for the session or focuses the existing one. */
  open(request: OpenPopoutRequest): void {
    const existing = this.windows.get(request.sessionId);

    if (existing && !existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) {
        existing.window.restore();
      }

      existing.window.focus();

      return;
    }

    const window = new BrowserWindow({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      title: `Pretty Logs: ${request.title}`,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: request.theme["--logsBackground"] ?? request.theme["--mainBackground"] ?? "#1e2124",
      webPreferences: {
        preload: path.join(this.options.distDir, "preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });

    this.windows.set(request.sessionId, { sessionId: request.sessionId, window });

    window.setMenuBarVisibility(false);
    window.once("ready-to-show", () => window.show());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.on("closed", () => {
      this.windows.delete(request.sessionId);
      this.options.broadcast({ sessionId: request.sessionId, message: { kind: "closed" } });
    });

    // The theme is pushed as soon as the page asks for it through the "ready" message.
    window.webContents.once("did-finish-load", () => this.send(request.sessionId, { type: "theme", theme: request.theme }));

    void window.loadFile(path.join(this.options.distDir, "popout.html"), {
      query: { sessionId: request.sessionId, title: request.title },
    });
  }

  /** Pushes a feed event to the window of a session. */
  sendEvent({ sessionId, event }: SendToPopoutRequest): void {
    this.send(sessionId, { type: "event", event });
  }

  close(sessionId: string): void {
    const entry = this.windows.get(sessionId);

    if (entry && !entry.window.isDestroyed()) {
      entry.window.close();
    }
  }

  closeAll(): void {
    for (const sessionId of [...this.windows.keys()]) {
      this.close(sessionId);
    }
  }

  private send(sessionId: string, message: HostToPopoutMessage): void {
    const entry = this.windows.get(sessionId);

    if (entry && !entry.window.isDestroyed()) {
      entry.window.webContents.send(WINDOW_CHANNELS.event, message);
    }
  }

  private findByContents(contents: WebContents): PopoutWindow | undefined {
    return [...this.windows.values()].find(entry => !entry.window.isDestroyed() && entry.window.webContents.id === contents.id);
  }

  /** The session id comes from our own bookkeeping, never from the message, so windows cannot impersonate each other. */
  private readonly onWindowMessage = (event: { sender: WebContents }, message: PopoutToHostMessage): void => {
    const entry = this.findByContents(event.sender);

    // "closed" is produced by the main process only
    if (entry && typeof message === "object" && message !== null && (message.kind === "ready" || message.kind === "control")) {
      this.options.broadcast({ sessionId: entry.sessionId, message });
    }
  };

  private readonly onSetPinned = (event: { sender: WebContents }, pinned: unknown): void => {
    const entry = this.findByContents(event.sender);

    if (entry) {
      entry.window.setAlwaysOnTop(pinned === true);
    }
  };
}
