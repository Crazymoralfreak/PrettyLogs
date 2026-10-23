import type { PopoutBridge } from "../common/ipc-channels";

declare global {
  interface Window {
    /** Exposed by the preload script of the pop-out window. */
    prettyLogsBridge?: PopoutBridge;
  }
}

export {};
