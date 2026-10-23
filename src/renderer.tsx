import { Renderer } from "@k8slens/extensions";
import { reaction } from "mobx";
import React from "react";
import { PrettyLogsStore } from "./common/store";
import { PrettyLogsMenuItem } from "./renderer/menu/PrettyLogsMenuItem";
import { MENU_KINDS } from "./renderer/menu/target";
import { PopoutBridge } from "./renderer/popout-bridge";
import { setRuntime } from "./renderer/runtime";
import { lensLogApi } from "./renderer/source/resolve-pods";
import { SessionRegistry } from "./renderer/source/session-registry";
import { LogsPage } from "./renderer/ui/LogsPage";
import { PrettyLogsHint, PrettyLogsSettings } from "./renderer/ui/Preferences";

const PAGE_ID = "logs";

class PrettyLogsIpc extends Renderer.Ipc {}

function PageIcon(): React.ReactElement {
  return <Renderer.Component.Icon material="subject" />;
}

export default class PrettyLogsRenderer extends Renderer.LensExtension {
  clusterPages = [
    {
      id: PAGE_ID,
      components: { Page: LogsPage },
    },
  ];

  clusterPageMenus = [
    {
      target: { pageId: PAGE_ID },
      title: "Pretty Logs",
      components: { Icon: PageIcon },
    },
  ];

  kubeObjectMenuItems = MENU_KINDS.map(({ kind, apiVersions }) => ({
    kind,
    apiVersions,
    components: { MenuItem: PrettyLogsMenuItem },
  }));

  appPreferences = [
    {
      title: "Pretty Logs",
      components: { Hint: PrettyLogsHint, Input: PrettyLogsSettings },
    },
  ];

  private bridge: PopoutBridge | null = null;
  private registry: SessionRegistry | null = null;
  private stopPresetSync: (() => void) | null = null;

  async onActivate(): Promise<void> {
    const store = PrettyLogsStore.createInstance();

    store.loadExtension(this);

    const registry = new SessionRegistry({
      api: lensLogApi,
      getSettings: () => store.settings,
      getPresets: () => store.presets,
      savePresets: presets => store.setPresets(presets),
    });
    const bridge = new PopoutBridge(PrettyLogsIpc.createInstance(this), registry);

    bridge.start();

    this.stopPresetSync = reaction(
      () => store.presets,
      presets => registry.getAll().forEach(session => session.setPresets(presets)),
    );

    this.registry = registry;
    this.bridge = bridge;

    setRuntime({ registry, store, openPage: () => void this.navigate(PAGE_ID) });
  }

  onDeactivate(): void {
    this.stopPresetSync?.();
    this.bridge?.stop();
    this.registry?.disposeAll();
    setRuntime(null);
    PrettyLogsStore.resetInstance();
    PrettyLogsIpc.resetInstance();
  }
}
