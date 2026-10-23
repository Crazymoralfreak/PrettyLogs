import type { FilterPreset, Settings, TargetKind } from "../../common/types";

/** What the user opened logs for: a pod or a workload that owns pods. */
export interface LogTarget {
  kind: TargetKind;
  name: string;
  namespace: string;
  /** Label selector of the workload; null for a plain Pod. */
  labelSelector: string | null;
}

export interface PodRef {
  name: string;
  phase: string;
  containers: string[];
  initContainers: string[];
}

export interface LogQuery {
  container: string;
  timestamps: true;
  tailLines?: number;
  sinceTime?: string;
  previous?: boolean;
}

/** Access to the Kubernetes API (implemented with the Lens API, replaceable in tests). */
export interface LogApi {
  resolvePods(target: LogTarget): Promise<PodRef[]>;
  getLogs(pod: string, namespace: string, query: LogQuery): Promise<string>;
}

export interface SessionDeps {
  api: LogApi;
  getSettings(): Settings;
  getPresets(): FilterPreset[];
  savePresets(presets: FilterPreset[]): void;
  /** Asked to move the session into a separate window. */
  openPopout(sessionId: string): void;
}

export function targetKey(target: LogTarget): string {
  return `${target.kind}/${target.namespace}/${target.name}`;
}
