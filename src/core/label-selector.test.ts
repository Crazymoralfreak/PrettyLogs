import { describe, expect, it } from "vitest";
import { buildLabelSelector, readSelector } from "./label-selector";

describe("buildLabelSelector", () => {
  it("joins match labels and expressions", () => {
    const selector = readSelector({
      selector: {
        matchLabels: { app: "api", tier: "backend" },
        matchExpressions: [
          { key: "env", operator: "In", values: ["prod", "stage"] },
          { key: "canary", operator: "DoesNotExist" },
        ],
      },
    });

    expect(buildLabelSelector(selector)).toBe("app=api,tier=backend,env in (prod,stage),!canary");
  });

  it("returns null for an empty or missing selector", () => {
    expect(buildLabelSelector(readSelector({}))).toBeNull();
    expect(buildLabelSelector(readSelector({ selector: {} }))).toBeNull();
  });
});
