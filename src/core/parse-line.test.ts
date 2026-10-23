import { describe, expect, it } from "vitest";
import { foldContinuations, isContinuationLine, parseLogBody, parseLogLine, splitPhysicalLines } from "./parse-line";

describe("parseLogLine", () => {
  it("extracts the kubernetes timestamp", () => {
    const parsed = parseLogLine("2024-03-01T10:20:30.123456789Z hello world");

    expect(parsed.text).toBe("hello world");
    expect(parsed.rawTs).toBe("2024-03-01T10:20:30.123456789Z");
    expect(parsed.ts).toBe(Date.parse("2024-03-01T10:20:30.123Z"));
  });

  it("keeps lines without a timestamp untouched", () => {
    const parsed = parseLogLine("no timestamp here");

    expect(parsed.ts).toBeNull();
    expect(parsed.text).toBe("no timestamp here");
  });

  it("orders timestamps with nanosecond precision", () => {
    const a = parseLogLine("2024-03-01T10:20:30.12Z a");
    const b = parseLogLine("2024-03-01T10:20:30.123Z b");

    expect(a.tsKey).not.toBeNull();
    expect(b.tsKey).not.toBeNull();
    expect((a.tsKey as bigint) < (b.tsKey as bigint)).toBe(true);
  });
});

describe("splitPhysicalLines", () => {
  it("drops the trailing empty line", () => {
    expect(splitPhysicalLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitPhysicalLines("")).toEqual([]);
  });
});

describe("foldContinuations", () => {
  it("merges stack traces into the preceding entry", () => {
    const body = [
      "2024-03-01T10:00:00Z ERROR boom",
      "2024-03-01T10:00:00Z \tat com.example.Foo(Foo.java:10)",
      "2024-03-01T10:00:00Z Caused by: java.lang.Exception",
      "2024-03-01T10:00:01Z INFO next",
    ].join("\n");
    const { entries, leading } = foldContinuations(parseLogBody(body));

    expect(leading).toHaveLength(0);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toContain("Caused by");
    expect(entries[1].text).toBe("INFO next");
  });

  it("reports continuation lines that open a batch", () => {
    const { entries, leading } = foldContinuations(parseLogBody("2024-03-01T10:00:00Z   at foo()\n2024-03-01T10:00:01Z INFO x"));

    expect(leading).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it("detects continuation lines", () => {
    expect(isContinuationLine("  indented")).toBe(true);
    expect(isContinuationLine("}")).toBe(true);
    expect(isContinuationLine("INFO started")).toBe(false);
  });
});
