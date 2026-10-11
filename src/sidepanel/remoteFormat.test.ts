import { describe, expect, it } from "vitest";
import { describeProperty, describeRemoteValue } from "./remoteFormat";

describe("CDP remote value formatting", () => {
  it("formats remote primitives and special values without evaluating code", () => {
    expect(describeRemoteValue({ type: "string", value: "hello" })).toBe('"hello"');
    expect(describeRemoteValue({ type: "number", unserializableValue: "NaN" })).toBe("NaN");
    expect(describeRemoteValue({ type: "bigint", unserializableValue: "123n" })).toBe("123n");
    expect(describeRemoteValue({ type: "object", subtype: "null", value: null })).toBe("null");
    expect(describeRemoteValue({ type: "function", description: "function heal() {}" }))
      .toBe("function heal() {}");
    expect(describeRemoteValue({ type: "object", subtype: "map", description: "Map(2)" }))
      .toBe("Map(2)");
  });

  it("labels accessors rather than showing misleading values", () => {
    expect(describeProperty({ kind: "own", name: "one", getter: true })).toBe("[Getter]");
    expect(describeProperty({ kind: "own", name: "two", setter: true })).toBe("[Setter]");
    expect(describeProperty({ kind: "own", name: "three", getter: true, setter: true }))
      .toBe("[Getter/Setter]");
  });
});
