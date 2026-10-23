import type {
  FeedEvent,
  FilterPreset,
  LogLevel,
  LogLine,
  SessionControl,
  SessionMeta,
  Settings,
  SourceInfo,
} from "../../common/types";
import { detectLevel } from "../../core/detect-level";
import type { ParsedLine } from "../../core/parse-line";
import { foldContinuations, joinLines, parseLogBody } from "../../core/parse-line";
import type { FeedListener, FeedState, LogFeed } from "../../viewer/feed";
import type { LogQuery, LogTarget, PodRef, SessionDeps } from "./types";

const RESOLVE_INTERVAL_MS = 5000;
const FETCH_CONCURRENCY = 6;

interface SourceState {
  info: SourceInfo;
  cursorKey: bigint | null;
  cursorRaw: string | null;
  /** Number of lines with exactly the cursor timestamp that were already delivered. */
  seenAtCursor: number;
  lastEntryId: number | null;
  /** The pod disappeared; nothing more to fetch. */
  gone: boolean;
  /** `previous` mode: the one-shot fetch has been performed. */
  done: boolean;
}

interface Batch {
  state: SourceState;
  entries: ParsedLine[];
  /** Continuation text to append to the last entry that was already emitted for this source. */
  extension: string | null;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;

      results[index] = await task(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
}

/**
 * Owns the log data of one target. It polls the Kubernetes API (the log endpoint of Lens cannot stream),
 * merges the streams of all selected containers by timestamp and notifies attached viewers.
 */
export class LogSession implements LogFeed {
  readonly canPopout = true;

  private readonly listeners = new Set<FeedListener>();
  private readonly sources = new Map<string, SourceState>();
  private readonly holders = new Set<string>();
  private lines: LogLine[] = [];
  private presets: FilterPreset[];
  private nextId = 1;
  private nextColor = 0;
  private generation = 0;
  private disposed = false;
  private running = false;
  private wakeRequested = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastResolveAt = 0;
  private forceResolve = true;
  private metaDirty = false;

  private paused = false;
  private loading = true;
  private error: string | null = null;
  private previous = false;
  private tailLines: number | null;
  private sinceSeconds: number | null = null;

  constructor(
    readonly id: string,
    readonly target: LogTarget,
    private readonly deps: SessionDeps,
  ) {
    const defaultTail = deps.getSettings().defaultTailLines;

    this.tailLines = defaultTail > 0 ? defaultTail : null;
    this.presets = deps.getPresets();
  }

  get title(): string {
    return `${this.target.kind}/${this.target.name}`;
  }

  // ---- LogFeed ----

  getSnapshot(): FeedState {
    return { lines: this.lines.slice(), meta: this.buildMeta(), presets: this.presets, lastEventAt: Date.now() };
  }

  subscribe(listener: FeedListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  send(control: SessionControl): void {
    this.control(control);
  }

  // ---- lifecycle ----

  /** Polling runs while at least one holder (visible tab, pop-out window) is registered. */
  retain(token: string): void {
    if (this.disposed) {
      return;
    }

    const wasIdle = this.holders.size === 0;

    this.holders.add(token);

    if (wasIdle) {
      this.wake();
    }
  }

  release(token: string): void {
    this.holders.delete(token);

    if (this.holders.size === 0) {
      this.clearTimer();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.clearTimer();
    this.holders.clear();
    this.listeners.clear();
  }

  setPresets(presets: FilterPreset[]): void {
    this.presets = presets;
    this.emit({ type: "presets", presets });
  }

  // ---- controls ----

  private control(control: SessionControl): void {
    switch (control.type) {
      case "toggleSource": {
        const state = this.sources.get(control.key);

        if (state) {
          state.info.enabled = control.enabled;
          this.publishMeta();
          this.wake();
        }

        break;
      }
      case "setAllSources":
        for (const state of this.sources.values()) {
          state.info.enabled = control.enabled;
        }

        this.publishMeta();
        this.wake();
        break;
      case "setPrevious":
        this.previous = control.previous;
        this.reload();
        break;
      case "setRange":
        this.tailLines = control.tailLines;
        this.sinceSeconds = control.sinceSeconds;
        this.reload();
        break;
      case "setPaused":
        this.paused = control.paused;
        this.publishMeta();

        if (!this.paused) {
          this.wake();
        }

        break;
      case "clear":
        this.lines = [];
        this.emit({ type: "clear" });
        break;
      case "reload":
        this.reload();
        break;
      case "savePresets":
        this.deps.savePresets(control.presets);
        break;
      case "openPopout":
        this.deps.openPopout(this.id);
        break;
      default: {
        const unreachable: never = control;

        throw new Error(`Unhandled control: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  private reload(): void {
    this.generation++;
    this.lines = [];
    this.loading = true;
    this.forceResolve = true;

    for (const state of this.sources.values()) {
      state.cursorKey = null;
      state.cursorRaw = null;
      state.seenAtCursor = 0;
      state.lastEntryId = null;
      state.done = false;
      state.info.error = null;
    }

    this.emit({ type: "clear" });
    this.publishMeta();
    this.wake();
  }

  // ---- polling ----

  private isActive(): boolean {
    return !this.disposed && this.holders.size > 0;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private wake(): void {
    if (!this.isActive()) {
      return;
    }

    if (this.running) {
      this.wakeRequested = true;

      return;
    }

    this.clearTimer();
    void this.cycle();
  }

  private async cycle(): Promise<void> {
    this.running = true;

    const generation = this.generation;

    try {
      if (!this.paused) {
        await this.refresh(generation);
      }
    } catch (error) {
      this.setError(describeError(error));
    } finally {
      this.running = false;
    }

    if (this.disposed) {
      return;
    }

    if (this.loading && generation === this.generation) {
      this.loading = false;
      this.metaDirty = true;
    }

    this.flushMeta();
    this.emit({ type: "tick", at: Date.now() });

    const immediate = this.wakeRequested;

    this.wakeRequested = false;

    if (this.isActive()) {
      this.timer = setTimeout(
        () => {
          this.timer = null;
          void this.cycle();
        },
        immediate ? 0 : this.deps.getSettings().pollIntervalMs,
      );
    }
  }

  private async refresh(generation: number): Promise<void> {
    const settings = this.deps.getSettings();

    if (this.forceResolve || Date.now() - this.lastResolveAt >= RESOLVE_INTERVAL_MS) {
      const pods = await this.deps.api.resolvePods(this.target);

      if (generation !== this.generation) {
        return;
      }

      this.forceResolve = false;
      this.lastResolveAt = Date.now();
      this.setError(null);
      this.syncSources(pods);
    }

    const pending = [...this.sources.values()].filter(state => state.info.enabled && !state.gone && !state.done);
    const batches = await mapLimit(pending, FETCH_CONCURRENCY, state => this.fetchSource(state, settings, generation));

    if (generation !== this.generation) {
      return;
    }

    this.commit(
      batches.filter((batch): batch is Batch => batch !== null),
      settings,
    );
  }

  private syncSources(pods: PodRef[]): void {
    const alive = new Set<string>();

    for (const pod of pods) {
      const containers = [
        ...pod.initContainers.map(name => ({ name, isInit: true })),
        ...pod.containers.map(name => ({ name, isInit: false })),
      ];

      for (const { name, isInit } of containers) {
        const key = `${pod.name}/${name}`;
        let state = this.sources.get(key);

        alive.add(key);

        if (!state) {
          state = this.createSource(key, pod.name, name, isInit);
          this.sources.set(key, state);
          this.metaDirty = true;
        }

        if (state.info.podPhase !== pod.phase || state.gone) {
          if (state.gone) {
            state.info.error = null;
          }

          state.info.podPhase = pod.phase;
          state.gone = false;
          this.metaDirty = true;
        }
      }
    }

    for (const [key, state] of this.sources) {
      if (!alive.has(key) && !state.gone) {
        state.gone = true;
        state.info.error = "Pod удалён или не найден";
        this.metaDirty = true;
      }
    }
  }

  private createSource(key: string, pod: string, container: string, isInit: boolean): SourceState {
    return {
      info: {
        key,
        pod,
        container,
        isInit,
        enabled: !isInit,
        colorIdx: this.nextColor++,
        error: null,
        podPhase: null,
      },
      cursorKey: null,
      cursorRaw: null,
      seenAtCursor: 0,
      lastEntryId: null,
      gone: false,
      done: false,
    };
  }

  private buildQuery(state: SourceState): LogQuery {
    const query: LogQuery = { container: state.info.container, timestamps: true };

    if (this.previous) {
      query.previous = true;

      if (this.tailLines !== null) {
        query.tailLines = this.tailLines;
      }
    } else if (state.cursorRaw) {
      query.sinceTime = state.cursorRaw;
    } else {
      if (this.tailLines !== null) {
        query.tailLines = this.tailLines;
      }

      if (this.sinceSeconds !== null) {
        query.sinceTime = new Date(Date.now() - this.sinceSeconds * 1000).toISOString();
      }
    }

    return query;
  }

  private async fetchSource(state: SourceState, settings: Settings, generation: number): Promise<Batch | null> {
    let body: string;

    try {
      body = await this.deps.api.getLogs(state.info.pod, this.target.namespace, this.buildQuery(state));
    } catch (error) {
      if (generation === this.generation) {
        if (this.previous) {
          state.done = true;
        }

        this.setSourceError(state, describeError(error));
      }

      return null;
    }

    if (generation !== this.generation) {
      return null;
    }

    if (this.previous) {
      state.done = true;
    }

    this.setSourceError(state, null);

    const fresh = this.takeFresh(state, parseLogBody(body));
    let entries = fresh.filter(line => line.text.trim().length > 0);
    let leading: ParsedLine[] = [];

    if (settings.mergeMultiline) {
      ({ entries, leading } = foldContinuations(fresh));
    }

    let extension: string | null = null;

    if (leading.length > 0) {
      if (state.lastEntryId !== null) {
        extension = leading.map(line => line.text).join("\n");
      } else {
        const joined = joinLines(leading);

        if (joined) {
          entries = [joined, ...entries];
        }
      }
    }

    return { state, entries, extension };
  }

  /** Drops lines that were already delivered and advances the cursor of the source. */
  private takeFresh(state: SourceState, parsed: ParsedLine[]): ParsedLine[] {
    const fresh: ParsedLine[] = [];
    let skipAtCursor = state.seenAtCursor;

    for (const line of parsed) {
      if (state.cursorKey !== null && line.tsKey !== null) {
        if (line.tsKey < state.cursorKey) {
          continue;
        }

        if (line.tsKey === state.cursorKey && skipAtCursor > 0) {
          skipAtCursor--;
          continue;
        }
      }

      fresh.push(line);
    }

    let maxKey: bigint | null = null;
    let maxRaw: string | null = null;
    let count = 0;

    for (const line of parsed) {
      if (line.tsKey === null) {
        continue;
      }

      if (maxKey === null || line.tsKey > maxKey) {
        maxKey = line.tsKey;
        maxRaw = line.rawTs;
        count = 1;
      } else if (line.tsKey === maxKey) {
        count++;
      }
    }

    if (maxKey !== null && (state.cursorKey === null || maxKey >= state.cursorKey)) {
      state.cursorKey = maxKey;
      state.cursorRaw = maxRaw;
      state.seenAtCursor = count;
    }

    return fresh;
  }

  private commit(batches: Batch[], settings: Settings): void {
    for (const batch of batches) {
      if (batch.extension !== null && batch.state.lastEntryId !== null) {
        this.extendLine(batch.state.lastEntryId, batch.extension);
      }
    }

    const items: Array<{ state: SourceState; entry: ParsedLine; key: bigint; order: number }> = [];
    let order = 0;

    for (const batch of batches) {
      let carry = BigInt(0);

      for (const entry of batch.entries) {
        const key = entry.tsKey ?? carry;

        carry = key;
        items.push({ state: batch.state, entry, key, order: order++ });
      }
    }

    if (items.length === 0) {
      return;
    }

    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.order - b.order));

    const added: LogLine[] = items.map(({ state, entry }) => {
      const line: LogLine = {
        id: this.nextId++,
        ts: entry.ts,
        source: state.info.key,
        text: entry.text,
        level: detectLevel(entry.text),
      };

      state.lastEntryId = line.id;

      return line;
    });

    this.lines = this.lines.concat(added);

    if (this.lines.length > settings.maxBufferLines) {
      this.lines = this.lines.slice(this.lines.length - settings.maxBufferLines);
    }

    this.emit({ type: "append", lines: added });
  }

  private extendLine(id: number, extra: string): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i];

      if (line.id < id) {
        return;
      }

      if (line.id === id) {
        const text = `${line.text}\n${extra}`;
        const level: LogLevel = line.level === "unknown" ? detectLevel(text) : line.level;

        this.lines[i] = { ...line, text, level };
        this.emit({ type: "update", id, text, level });

        return;
      }
    }
  }

  // ---- state publishing ----

  private setError(message: string | null): void {
    if (this.error !== message) {
      this.error = message;
      this.metaDirty = true;
    }
  }

  private setSourceError(state: SourceState, message: string | null): void {
    if (state.info.error !== message) {
      state.info.error = message;
      this.metaDirty = true;
    }
  }

  private publishMeta(): void {
    this.metaDirty = true;
    this.flushMeta();
  }

  private flushMeta(): void {
    if (this.metaDirty) {
      this.metaDirty = false;
      this.emit({ type: "meta", meta: this.buildMeta() });
    }
  }

  private buildMeta(): SessionMeta {
    const settings = this.deps.getSettings();
    const sources = [...this.sources.values()]
      .map(state => ({ ...state.info }))
      .sort((a, b) => a.pod.localeCompare(b.pod) || Number(b.isInit) - Number(a.isInit) || a.container.localeCompare(b.container));

    return {
      title: this.title,
      subtitle: this.target.namespace,
      kind: this.target.kind,
      namespace: this.target.namespace,
      sources,
      previous: this.previous,
      tailLines: this.tailLines,
      sinceSeconds: this.sinceSeconds,
      paused: this.paused,
      loading: this.loading,
      error: this.error,
      maxLines: settings.maxBufferLines,
      pollIntervalMs: settings.pollIntervalMs,
    };
  }

  private emit(event: FeedEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // a broken viewer must not stop the session
      }
    }
  }
}
