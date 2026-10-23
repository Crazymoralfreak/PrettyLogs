import { describe, expect, it } from "vitest";
import type { FilterState, LogLine } from "../common/types";
import { compileFilter, createRule, defaultFilterState, sanitizeFilterState } from "./filter-engine";

function line(id: number, text: string, level: LogLine["level"] = "info"): LogLine {
  return { id, ts: null, source: "pod/main", text, level };
}

function withState(patch: (state: FilterState) => void): FilterState {
  const state = defaultFilterState();

  patch(state);

  return state;
}

describe("compileFilter", () => {
  it("filters by level", () => {
    const filter = compileFilter(withState(state => (state.levels.debug = false)));

    expect(filter.accepts(line(1, "x", "debug"))).toBe(false);
    expect(filter.accepts(line(2, "x", "error"))).toBe(true);
  });

  it("supports regex search with case sensitivity", () => {
    const filter = compileFilter(
      withState(state => {
        state.search = { ...state.search, query: "user-\\d+", isRegex: true };
      }),
    );

    expect(filter.accepts(line(1, "login USER-42"))).toBe(true);
    expect(filter.accepts(line(2, "login guest"))).toBe(false);
    expect(filter.ranges("a user-1 b user-22")).toHaveLength(2);
  });

  it("inverts the search", () => {
    const filter = compileFilter(
      withState(state => {
        state.search = { ...state.search, query: "health", invert: true };
      }),
    );

    expect(filter.accepts(line(1, "GET /health"))).toBe(false);
    expect(filter.accepts(line(2, "GET /orders"))).toBe(true);
  });

  it("reports invalid regular expressions and does not filter", () => {
    const filter = compileFilter(
      withState(state => {
        state.search = { ...state.search, query: "(", isRegex: true };
      }),
    );

    expect(filter.searchError).not.toBeNull();
    expect(filter.accepts(line(1, "anything"))).toBe(true);
  });

  it("combines include, exclude and highlight rules", () => {
    const include = { ...createRule(0), pattern: "payment", mode: "include" as const };
    const exclude = { ...createRule(1), pattern: "debug-only", mode: "exclude" as const };
    const highlight = { ...createRule(2), pattern: "\\d+ms", isRegex: true, mode: "highlight" as const };
    const filter = compileFilter(withState(state => (state.rules = [include, exclude, highlight])));

    expect(filter.accepts(line(1, "payment ok 12ms"))).toBe(true);
    expect(filter.accepts(line(2, "payment debug-only"))).toBe(false);
    expect(filter.accepts(line(3, "orders ok"))).toBe(false);
    expect(filter.ranges("payment ok 12ms").some(range => range.color === highlight.color)).toBe(true);
  });

  it("does not hang on zero-length matches", () => {
    const filter = compileFilter(
      withState(state => {
        state.search = { ...state.search, query: "x*", isRegex: true, mode: "highlight" };
      }),
    );

    expect(filter.ranges("aaxxbb")).toHaveLength(1);
  });
});

describe("sanitizeFilterState", () => {
  it("falls back to defaults for garbage", () => {
    expect(sanitizeFilterState(42)).toEqual(defaultFilterState());
  });

  it("keeps valid fields", () => {
    const state = sanitizeFilterState({ levels: { debug: false }, search: { query: "a", mode: "highlight" }, rules: [{ pattern: "x" }] });

    expect(state.levels.debug).toBe(false);
    expect(state.levels.info).toBe(true);
    expect(state.search.mode).toBe("highlight");
    expect(state.rules[0].pattern).toBe("x");
  });
});
