import { LogSession } from "./log-session";
import type { LogTarget, SessionDeps } from "./types";
import { targetKey } from "./types";

export interface TabInfo {
  id: string;
  title: string;
  subtitle: string;
}

export interface RegistryState {
  tabs: TabInfo[];
  activeId: string | null;
}

export type RegistryListener = (state: RegistryState) => void;

const VIEW_TOKEN = "view";
const POPOUT_TOKEN = "popout";

/**
 * Keeps all log sessions of a cluster frame: the tabs shown on the Pretty Logs page and sessions that
 * only live in a pop-out window.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, LogSession>();
  private readonly tabIds: string[] = [];
  private readonly popoutIds = new Set<string>();
  private readonly listeners = new Set<RegistryListener>();
  private activeId: string | null = null;
  private pageVisible = false;
  private counter = 0;
  private popoutOpener: ((session: LogSession) => void) | null = null;

  constructor(private readonly depsBase: Omit<SessionDeps, "openPopout">) {}

  /** The pop-out bridge registers itself here. */
  setPopoutOpener(opener: (session: LogSession) => void): void {
    this.popoutOpener = opener;
  }

  getSession(id: string): LogSession | undefined {
    return this.sessions.get(id);
  }

  getAll(): LogSession[] {
    return [...this.sessions.values()];
  }

  getState(): RegistryState {
    return {
      tabs: this.tabIds.flatMap(id => {
        const session = this.sessions.get(id);

        return session ? [{ id, title: session.title, subtitle: session.target.namespace }] : [];
      }),
      activeId: this.activeId,
    };
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Opens (or focuses) a tab for the target. */
  openTab(target: LogTarget): LogSession {
    const existing = this.tabIds.map(id => this.sessions.get(id)).find(session => session && targetKey(session.target) === targetKey(target));
    const session = existing ?? this.createSession(target);

    if (!this.tabIds.includes(session.id)) {
      this.tabIds.push(session.id);
    }

    this.activeId = session.id;
    this.applyViewHolder();
    this.notify();

    return session;
  }

  setActive(id: string): void {
    if (this.tabIds.includes(id) && this.activeId !== id) {
      this.activeId = id;
      this.applyViewHolder();
      this.notify();
    }
  }

  closeTab(id: string): void {
    const index = this.tabIds.indexOf(id);

    if (index === -1) {
      return;
    }

    this.tabIds.splice(index, 1);

    if (this.activeId === id) {
      this.activeId = this.tabIds[Math.min(index, this.tabIds.length - 1)] ?? null;
    }

    this.disposeIfUnused(id);
    this.applyViewHolder();
    this.notify();
  }

  /** The Pretty Logs page tells whether it is currently on screen; only the visible tab polls. */
  setPageVisible(visible: boolean): void {
    this.pageVisible = visible;
    this.applyViewHolder();
  }

  /** Opens the target in a separate window without adding a tab. */
  openTargetInPopout(target: LogTarget): void {
    this.openSessionInPopout(this.createSession(target));
  }

  openSessionInPopout(session: LogSession): void {
    this.popoutIds.add(session.id);
    session.retain(POPOUT_TOKEN);
    this.popoutOpener?.(session);
  }

  openSessionInPopoutById(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.openSessionInPopout(session);
    }
  }

  handlePopoutClosed(sessionId: string): void {
    this.popoutIds.delete(sessionId);
    this.sessions.get(sessionId)?.release(POPOUT_TOKEN);
    this.disposeIfUnused(sessionId);
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }

    this.sessions.clear();
    this.tabIds.length = 0;
    this.popoutIds.clear();
    this.activeId = null;
    this.pageVisible = false;
    this.notify();
  }

  private createSession(target: LogTarget): LogSession {
    const id = `${targetKey(target)}#${++this.counter}`;
    const session = new LogSession(id, target, {
      ...this.depsBase,
      openPopout: sessionId => this.openSessionInPopoutById(sessionId),
    });

    this.sessions.set(id, session);

    return session;
  }

  private disposeIfUnused(id: string): void {
    if (this.tabIds.includes(id) || this.popoutIds.has(id)) {
      return;
    }

    this.sessions.get(id)?.dispose();
    this.sessions.delete(id);
  }

  private applyViewHolder(): void {
    const visibleId = this.pageVisible ? this.activeId : null;

    for (const session of this.sessions.values()) {
      if (session.id === visibleId) {
        session.retain(VIEW_TOKEN);
      } else {
        session.release(VIEW_TOKEN);
      }
    }

  }

  private notify(): void {
    const state = this.getState();

    for (const listener of [...this.listeners]) {
      listener(state);
    }
  }
}
