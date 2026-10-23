import { Main } from "@k8slens/extensions";
import type { OpenPopoutRequest, PopoutBroadcast, SendToPopoutRequest } from "./common/ipc-channels";
import { LENS_CHANNELS } from "./common/ipc-channels";
import { PrettyLogsStore } from "./common/store";
import { PopoutWindowManager } from "./main/popout-window-manager";

class PrettyLogsIpc extends Main.Ipc {}

export default class PrettyLogsMain extends Main.LensExtension {
  private windows: PopoutWindowManager | null = null;

  async onActivate(): Promise<void> {
    // The store is created in the main process too, because Lens persists extension stores from here.
    PrettyLogsStore.createInstance().loadExtension(this);

    const ipc = PrettyLogsIpc.createInstance(this);
    const windows = new PopoutWindowManager({
      // __dirname is the extension "dist" directory (webpack keeps the real value for the main bundle)
      distDir: __dirname,
      broadcast: (message: PopoutBroadcast) => ipc.broadcast(LENS_CHANNELS.fromPopout, message),
    });

    ipc.handle(LENS_CHANNELS.openPopout, (_event, request: OpenPopoutRequest) => windows.open(request));
    ipc.handle(LENS_CHANNELS.sendToPopout, (_event, request: SendToPopoutRequest) => windows.sendEvent(request));
    ipc.handle(LENS_CHANNELS.closePopout, (_event, sessionId: string) => windows.close(sessionId));

    windows.start();
    this.windows = windows;
  }

  onDeactivate(): void {
    this.windows?.stop();
    this.windows = null;
    PrettyLogsStore.resetInstance();
    PrettyLogsIpc.resetInstance();
  }
}
