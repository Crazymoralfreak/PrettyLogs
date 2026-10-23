import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogViewer } from "../../viewer";
import { Icon } from "../../viewer/icons";
import { getRuntime } from "../runtime";
import type { RegistryState } from "../source/session-registry";

const MIN_PAGE_HEIGHT = 240;

function useRegistryState(): RegistryState {
  const { registry } = getRuntime();
  const [state, setState] = useState<RegistryState>(() => registry.getState());

  useEffect(() => {
    setState(registry.getState());

    return registry.subscribe(setState);
  }, [registry]);

  return state;
}

/** Makes the page fill the available height even if the Lens layout does not give it a definite one. */
function useFillHeight(ref: React.RefObject<HTMLDivElement>): void {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const fit = (): void => {
      element.style.height = "";

      if (element.getBoundingClientRect().height < MIN_PAGE_HEIGHT) {
        const top = element.getBoundingClientRect().top;

        element.style.height = `${Math.max(MIN_PAGE_HEIGHT, window.innerHeight - top - 8)}px`;
      }
    };

    fit();
    window.addEventListener("resize", fit);

    return () => window.removeEventListener("resize", fit);
  }, [ref]);
}

/** The "Pretty Logs" page: tabs with one log viewer per opened pod or workload. */
export function LogsPage(): React.ReactElement {
  const { registry } = getRuntime();
  const { tabs, activeId } = useRegistryState();
  const pageRef = useRef<HTMLDivElement>(null);
  const activeSession = activeId ? registry.getSession(activeId) : undefined;

  useFillHeight(pageRef);

  useEffect(() => {
    registry.setPageVisible(true);

    return () => registry.setPageVisible(false);
  }, [registry]);

  return (
    <div className="pl-page" ref={pageRef}>
      {tabs.length > 0 ? (
        <div className="pl-tabs">
          {tabs.map(tab => (
            <div key={tab.id} className={`pl-tab${tab.id === activeId ? " pl-tab-active" : ""}`} onClick={() => registry.setActive(tab.id)}>
              <span className="pl-tab-title">{tab.title}</span>
              <span className="pl-tab-ns">{tab.subtitle}</span>
              <button
                type="button"
                className="pl-icon-btn"
                title="Закрыть вкладку"
                onClick={event => {
                  event.stopPropagation();
                  registry.closeTab(tab.id);
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="pl-page-body">
        {activeSession ? (
          <LogViewer key={activeSession.id} feed={activeSession} />
        ) : (
          <div className="pl-page-empty">
            <div>
              Откройте логи через контекстное меню Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet или Job:
              <br />
              «Pretty Logs» открывает вкладку здесь, «Pretty Logs в окне» открывает отдельное окно.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
