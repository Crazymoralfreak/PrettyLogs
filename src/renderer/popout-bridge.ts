import type { Renderer } from "@k8slens/extensions";
import type { OpenPopoutRequest, PopoutBroadcast, SendToPopoutRequest } from "../common/ipc-channels";
import { LENS_CHANNELS } from "../common/ipc-channels";
import type { FeedEvent } from "../common/types";
import type { LogSession } from "./source/log-session";
import type { SessionRegistry } from "./source/session-registry";
import { readThemeVars } from "./theme";

type LensIpc = Pick<Renderer.Ipc, "listen" | "invoke">;

/**
 * Connects log sessions of this cluster frame with pop-out windows owned by the main process.
 * Events flow session -> main process -> window, controls flow window -> main process -> session.
 */
export class PopoutBridge {
  private readonly attached = new Map<string, () => void>();
  private stopListening: (() => void) | null = null;

  constructor(
    private readonly ipc: LensIpc,
    private readonly registry: SessionRegistry,
  ) {
    registry.setPopoutOpener(session => this.open(session));
  }

  start(): void {
    this.stopListening = this.ipc.listen(LENS_CHANNELS.fromPopout, (_event, payload: PopoutBroadcast) => this.onBroadcast(payload));
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;

    for (const detach of this.attached.values()) {
      detach();
    }

    this.attached.clear();
  }

  private open(session: LogSession): void {
    const request: OpenPopoutRequest = { sessionId: session.id, title: session.title, theme: readThemeVars() };

    void this.ipc.invoke(LENS_CHANNELS.openPopout, request).catch(() => undefined);
  }

  private onBroadcast({ sessionId, message }: PopoutBroadcast): void {
    const session = this.registry.getSession(sessionId);

    if (!session) {
      return;
    }

    switch (message.kind) {
      case "ready":
        this.attach(session);
        break;
      case "control":
        session.send(message.control);
        break;
      case "closed":
        this.detach(sessionId);
        this.registry.handlePopoutClosed(sessionId);
        break;
      default: {
        const unreachable: never = message;

        throw new Error(`Unhandled popout message: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  private attach(session: LogSession): void {
    this.detach(session.id);

    const snapshot = session.getSnapshot();

    if (!snapshot.meta) {
      return;
    }

    const push = (event: FeedEvent): void => {
      const request: SendToPopoutRequest = { sessionId: session.id, event };

      void this.ipc.invoke(LENS_CHANNELS.sendToPopout, request).catch(() => undefined);
    };

    push({ type: "snapshot", lines: snapshot.lines, meta: snapshot.meta, presets: snapshot.presets });
    this.attached.set(session.id, session.subscribe(push));
  }

  private detach(sessionId: string): void {
    this.attached.get(sessionId)?.();
    this.attached.delete(sessionId);
  }
}
