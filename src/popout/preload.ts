import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";
import type { HostToPopoutMessage, PopoutBridge, PopoutToHostMessage } from "../common/ipc-channels";
import { WINDOW_CHANNELS } from "../common/ipc-channels";

const params = new URLSearchParams(window.location.search);

const bridge: PopoutBridge = {
  sessionId: params.get("sessionId") ?? "",
  title: params.get("title") ?? "Logs",
  send: (message: PopoutToHostMessage) => ipcRenderer.send(WINDOW_CHANNELS.message, message),
  setPinned: (pinned: boolean) => ipcRenderer.send(WINDOW_CHANNELS.setPinned, pinned),
  onMessage: listener => {
    const handler = (_event: IpcRendererEvent, message: HostToPopoutMessage): void => listener(message);

    ipcRenderer.on(WINDOW_CHANNELS.event, handler);

    return () => {
      ipcRenderer.removeListener(WINDOW_CHANNELS.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld("prettyLogsBridge", bridge);
