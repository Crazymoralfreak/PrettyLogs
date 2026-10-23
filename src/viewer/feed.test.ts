import { describe, expect, it } from "vitest";
import type { LogLine, SessionMeta } from "../common/types";
import { applyFeedEvent, emptyFeedState } from "./feed";

function line(id: number, text = "x"): LogLine {
  return { id, ts: null, source: "p/c", text, level: "info" };
}

const meta: SessionMeta = {
  title: "Pod/a",
  subtitle: "default",
  kind: "Pod",
  namespace: "default",
  sources: [],
  previous: false,
  tailLines: 100,
  sinceSeconds: null,
  paused: false,
  loading: false,
  error: null,
  maxLines: 3,
  pollIntervalMs: 1500,
};

describe("applyFeedEvent", () => {
  it("applies a snapshot", () => {
    const state = applyFeedEvent(emptyFeedState(), { type: "snapshot", lines: [line(1)], meta, presets: [] });

    expect(state.lines).toHaveLength(1);
    expect(state.meta).toBe(meta);
  });

  it("trims the buffer to maxLines", () => {
    const start = applyFeedEvent(emptyFeedState(), { type: "snapshot", lines: [line(1), line(2)], meta, presets: [] });
    const next = applyFeedEvent(start, { type: "append", lines: [line(3), line(4)] });

    expect(next.lines.map(item => item.id)).toEqual([2, 3, 4]);
  });

  it("updates an existing line by id", () => {
    const start = applyFeedEvent(emptyFeedState(), { type: "snapshot", lines: [line(1), line(5)], meta, presets: [] });
    const next = applyFeedEvent(start, { type: "update", id: 5, text: "changed", level: "error" });

    expect(next.lines[1]).toMatchObject({ text: "changed", level: "error" });
    expect(next.lines[0].text).toBe("x");
  });

  it("clears lines", () => {
    const start = applyFeedEvent(emptyFeedState(), { type: "append", lines: [line(1)] });

    expect(applyFeedEvent(start, { type: "clear" }).lines).toHaveLength(0);
  });
});
