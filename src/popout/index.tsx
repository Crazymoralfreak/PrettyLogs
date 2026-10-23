import React from "react";
import ReactDOM from "react-dom";
import type { ThemeVars } from "../common/types";
import { LogViewer } from "../viewer";
import { IpcFeed } from "./ipc-feed";

const THEME_WAIT_MS = 1500;

function applyTheme(theme: ThemeVars): void {
  for (const [name, value] of Object.entries(theme)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function start(): void {
  const container = document.getElementById("root");
  const bridge = window.prettyLogsBridge;

  if (!container) {
    return;
  }

  if (!bridge) {
    container.textContent = "Окно открыто без связи с Lens. Закройте его и откройте логи заново из Lens.";

    return;
  }

  document.title = `Pretty Logs: ${bridge.title}`;

  const feed = new IpcFeed(bridge);
  let mounted = false;

  const mount = (): void => {
    if (mounted) {
      return;
    }

    mounted = true;
    ReactDOM.render(<LogViewer feed={feed} />, container);
    // From now on the viewer is subscribed, ask the session for a full snapshot.
    bridge.send({ kind: "ready" });
  };

  // The theme is applied before the first render so that light/dark detection sees the final colors.
  bridge.onMessage(message => {
    if (message.type === "theme") {
      applyTheme(message.theme);
      mount();
    }
  });

  setTimeout(mount, THEME_WAIT_MS);
}

start();
