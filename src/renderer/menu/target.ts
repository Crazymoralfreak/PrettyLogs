import type { Renderer } from "@k8slens/extensions";
import type { TargetKind } from "../../common/types";
import { TARGET_KINDS } from "../../common/types";
import { buildLabelSelector, readSelector } from "../../core/label-selector";
import type { LogTarget } from "../source/types";

/** Kinds for which the Pretty Logs menu items are registered, with their API versions. */
export const MENU_KINDS: Array<{ kind: TargetKind; apiVersions: string[] }> = [
  { kind: "Pod", apiVersions: ["v1"] },
  { kind: "Deployment", apiVersions: ["apps/v1"] },
  { kind: "StatefulSet", apiVersions: ["apps/v1"] },
  { kind: "DaemonSet", apiVersions: ["apps/v1"] },
  { kind: "ReplicaSet", apiVersions: ["apps/v1"] },
  { kind: "Job", apiVersions: ["batch/v1"] },
];

/** Builds the log target for a Kubernetes object, or null when the object has no usable pod selector. */
export function targetFromObject(object: Renderer.K8sApi.KubeObject): LogTarget | null {
  const kind = TARGET_KINDS.find(item => item === object.kind);

  if (!kind) {
    return null;
  }

  const name = object.getName();
  const namespace = object.getNs() ?? "";

  if (kind === "Pod") {
    return { kind, name, namespace, labelSelector: null };
  }

  const labelSelector = buildLabelSelector(readSelector((object as { spec?: unknown }).spec));

  return labelSelector ? { kind, name, namespace, labelSelector } : null;
}
