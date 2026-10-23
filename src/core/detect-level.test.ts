import { describe, expect, it } from "vitest";
import { detectLevel, normalizeLevel } from "./detect-level";

describe("detectLevel", () => {
  it("reads json level fields", () => {
    expect(detectLevel('{"level":"warn","msg":"x"}')).toBe("warn");
    expect(detectLevel('{"severity":"ERROR","message":"x"}')).toBe("error");
    expect(detectLevel('{"@l":"Fatal","@m":"x"}')).toBe("fatal");
  });

  it("maps numeric pino/bunyan levels", () => {
    expect(detectLevel('{"level":30,"msg":"x"}')).toBe("info");
    expect(detectLevel('{"level":50,"msg":"x"}')).toBe("error");
    expect(detectLevel('{"level":10,"msg":"x"}')).toBe("trace");
  });

  it("reads klog prefixes", () => {
    expect(detectLevel("E0123 10:20:30.123456       1 main.go:10] failed")).toBe("error");
    expect(detectLevel("I0123 10:20:30.123456       1 main.go:10] started")).toBe("info");
  });

  it("reads logfmt levels", () => {
    expect(detectLevel('time=2024 level=debug msg="x"')).toBe("debug");
  });

  it("finds level tokens in plain text", () => {
    expect(detectLevel("2024-03-01 10:00:00 [INFO] started")).toBe("info");
    expect(detectLevel("2024-03-01 10:00:00 WARNING disk almost full")).toBe("warn");
    expect(detectLevel("something [error] happened")).toBe("error");
  });

  it("uses stack trace heuristics", () => {
    expect(detectLevel("Unhandled\n\tat com.example.Foo(Foo.java:10)")).toBe("error");
    expect(detectLevel("panic: nil pointer dereference")).toBe("fatal");
  });

  it("returns unknown when nothing matches", () => {
    expect(detectLevel("just a message")).toBe("unknown");
  });
});

describe("normalizeLevel", () => {
  it("normalizes aliases", () => {
    expect(normalizeLevel("Information")).toBe("info");
    expect(normalizeLevel("CRITICAL")).toBe("fatal");
    expect(normalizeLevel("nope")).toBeNull();
  });
});
