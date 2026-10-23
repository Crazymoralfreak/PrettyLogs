import { Renderer } from "@k8slens/extensions";
import type { LogApi, LogQuery, LogTarget, PodRef } from "./types";

type Pod = Renderer.K8sApi.Pod;

function toPodRef(pod: Pod): PodRef {
  return {
    name: pod.getName(),
    phase: String(pod.getStatus()),
    containers: pod.getContainers().map(container => container.name),
    initContainers: pod.getInitContainers().map(container => container.name),
  };
}

/** {@link LogApi} backed by the Kubernetes API client of the current Lens cluster frame. */
export const lensLogApi: LogApi = {
  async resolvePods(target: LogTarget): Promise<PodRef[]> {
    const { podsApi } = Renderer.K8sApi;

    if (target.kind === "Pod") {
      const pod = await podsApi.get({ name: target.name, namespace: target.namespace });

      return pod ? [toPodRef(pod)] : [];
    }

    if (target.labelSelector === null) {
      return [];
    }

    const pods = await podsApi.list({ namespace: target.namespace }, { labelSelector: target.labelSelector });

    return (pods ?? []).map(toPodRef).sort((a, b) => a.name.localeCompare(b.name));
  },

  getLogs(pod: string, namespace: string, query: LogQuery): Promise<string> {
    return Renderer.K8sApi.podsApi.getLogs({ name: pod, namespace }, query);
  },
};
