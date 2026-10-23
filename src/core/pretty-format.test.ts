import { describe, expect, it } from "vitest";
import { applyRanges, tokenizeLogLine } from "./highlight";
import { buildPayloads } from "./pretty-format";

describe("buildPayloads", () => {
  it("formats embedded json", () => {
    const [payload] = buildPayloads('2024-01-01 INFO request {"a":1,"b":{"c":[1,2]}} done');

    expect(payload.kind).toBe("json");
    expect(payload.pretty).toContain('\n  "a": 1');
    expect(payload.raw).toBe('{"a":1,"b":{"c":[1,2]}}');
  });

  it("expands json stored in string values", () => {
    const [payload] = buildPayloads('{"message":"{\\"inner\\":true}"}');

    expect(payload.pretty).toContain('"inner": true');
  });

  it("formats xml", () => {
    const [payload] = buildPayloads('response: <?xml version="1.0"?><root><a>1</a><b/></root>');

    expect(payload.kind).toBe("xml");
    expect(payload.pretty).toContain("\n  <a>1</a>");
  });

  it("formats multi-line yaml", () => {
    const [payload] = buildPayloads("config:\n  name: app\n  replicas: 3\n  ports:\n    - 80\n    - 443");

    expect(payload.kind).toBe("yaml");
    expect(payload.pretty).toContain("replicas: 3");
  });

  it("formats logfmt records", () => {
    const [payload] = buildPayloads('time=2024 level=info msg="hello world" user=bob');

    expect(payload.kind).toBe("logfmt");
    expect(payload.pretty).toContain("msg   = hello world");
  });

  it("formats sql", () => {
    const [payload] = buildPayloads("Executing: SELECT id, name FROM users WHERE id = 1");

    expect(payload.kind).toBe("sql");
    expect(payload.pretty).toContain("FROM");
  });

  it("ignores plain text and broken payloads", () => {
    expect(buildPayloads("just text [INFO] {not json}")).toHaveLength(0);
  });
});

describe("tokenizeLogLine", () => {
  it("classifies timestamps, levels and numbers", () => {
    const segments = tokenizeLogLine("2024-03-01T10:00:00Z ERROR took 15ms");
    const classes = segments.filter(segment => segment.cls).map(segment => segment.cls);

    expect(classes).toContain("tok-ts");
    expect(classes).toContain("tok-lvl tok-lvl-error");
    expect(classes).toContain("tok-num");
    expect(segments.map(segment => segment.text).join("")).toBe("2024-03-01T10:00:00Z ERROR took 15ms");
  });
});

describe("applyRanges", () => {
  it("splits segments on range boundaries and keeps the text intact", () => {
    const segments = tokenizeLogLine("hello world");
    const marked = applyRanges(segments, [{ start: 3, end: 8, kind: "search" }]);

    expect(marked.map(segment => segment.text).join("")).toBe("hello world");
    expect(marked.filter(segment => segment.mark).map(segment => segment.text).join("")).toBe("lo wo");
  });
});
