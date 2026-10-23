import { Renderer } from "@k8slens/extensions";
import React from "react";
import { getRuntime } from "../runtime";
import { targetFromObject } from "./target";

const { MenuItem, Icon } = Renderer.Component;

interface PrettyLogsMenuItemProps {
  object: Renderer.K8sApi.KubeObject;
  toolbar?: boolean;
}

/** "Pretty Logs" and "Pretty Logs in a window" entries of the object context menu. */
export function PrettyLogsMenuItem({ object, toolbar }: PrettyLogsMenuItemProps): React.ReactElement | null {
  const target = targetFromObject(object);

  if (!target) {
    return null;
  }

  const openTab = (): void => {
    const runtime = getRuntime();

    runtime.registry.openTab(target);
    runtime.openPage();
  };

  const openWindow = (): void => {
    getRuntime().registry.openTargetInPopout(target);
  };

  return (
    <>
      <MenuItem onClick={openTab}>
        <Icon material="subject" interactive={toolbar} tooltip={toolbar ? "Pretty Logs" : undefined} />
        <span className="title">Pretty Logs</span>
      </MenuItem>
      <MenuItem onClick={openWindow}>
        <Icon material="open_in_new" interactive={toolbar} tooltip={toolbar ? "Pretty Logs в окне" : undefined} />
        <span className="title">Pretty Logs в окне</span>
      </MenuItem>
    </>
  );
}
