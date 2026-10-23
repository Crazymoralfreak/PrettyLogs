import type { PrettyLogsStore } from "../common/store";
import type { SessionRegistry } from "./source/session-registry";

/** Objects shared by the UI components of one cluster frame; created in `onActivate`. */
export interface Runtime {
  registry: SessionRegistry;
  store: PrettyLogsStore;
  /** Navigates to the Pretty Logs page. */
  openPage: () => void;
}

let current: Runtime | null = null;

export function setRuntime(runtime: Runtime | null): void {
  current = runtime;
}

export function getRuntime(): Runtime {
  if (!current) {
    throw new Error("Pretty Logs extension is not activated");
  }

  return current;
}
