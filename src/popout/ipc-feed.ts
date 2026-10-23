import type { PopoutBridge } from "../common/ipc-channels";
import type { FeedEvent, SessionControl } from "../common/types";
import type { FeedListener, FeedState, LogFeed } from "../viewer/feed";
import { emptyFeedState } from "../viewer/feed";

/** Without any event for this long the window warns that the cluster frame is gone. */
const STALE_AFTER_MS = 15000;

/**
 * {@link LogFeed} of the pop-out window: events come from the session in the Lens cluster frame
 * (through the main process), controls go back the same way. The viewer keeps the state itself.
 */
export class IpcFeed implements LogFeed {
  readonly canPopout = false;
  readonly staleAfterMs = STALE_AFTER_MS;

  private readonly listeners = new Set<FeedListener>();

  constructor(private readonly bridge: PopoutBridge) {
    bridge.onMessage(message => {
      if (message.type === "event") {
        this.emit(message.event);
      }
    });
  }

  getSnapshot(): FeedState {
    return emptyFeedState();
  }

  subscribe(listener: FeedListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  send(control: SessionControl): void {
    this.bridge.send({ kind: "control", control });
  }

  setWindowPinned(pinned: boolean): void {
    this.bridge.setPinned(pinned);
  }

  private emit(event: FeedEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}
