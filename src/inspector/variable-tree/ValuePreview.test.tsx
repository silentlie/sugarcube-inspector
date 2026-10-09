// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ValuePreview, { formatValue } from "./ValuePreview";

afterEach(cleanup);

describe("variable value previews", () => {
  it.each([
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["string", "map", '"map"'],
    ["empty string", "", '""'],
    ["escaped string", 'map\n"key"', '"map\\n\\"key\\""'],
    ["number", 7, "7"],
    ["negative zero", -0, "-0"],
    ["NaN", NaN, "NaN"],
    ["infinity", Infinity, "Infinity"],
    ["negative infinity", -Infinity, "-Infinity"],
    ["true", true, "true"],
    ["false", false, "false"],
    ["bigint", 7n, "7n"],
    ["symbol", Symbol("item"), "Symbol(item)"],
    ["function", function awardScore() {}, "awardScore"],
    ["array", ["map", "key"], "2 items"],
    ["Map", new Map([["score", 7]]), "1 entries"],
    ["Set", new Set(["map"]), "1 values"],
    ["date", new Date("2026-10-09T00:00:00Z"), "2026-10-09T00:00:00.000Z"],
    ["invalid date", new Date(NaN), "Invalid Date"],
    ["RegExp", /map/gi, "/map/gi"],
    ["error", new TypeError("missing"), "missing"],
    ["ArrayBuffer", new ArrayBuffer(8), "8 bytes"],
    ["typed array", new Uint16Array([1, 2]), "4 bytes"],
    ["DataView", new DataView(new ArrayBuffer(8)), "8 bytes"],
    ["WeakMap", new WeakMap(), "Contents unavailable"],
    ["WeakSet", new WeakSet(), "Contents unavailable"],
    ["object", { score: 7, inventory: [] }, "2 properties"],
  ])("formats %s for the value column", (_name, value, preview) => {
    expect(formatValue(value)).toBe(preview);
  });

  it("formats an unnamed function without an empty function label", () => {
    const anonymous = function () {};
    Object.defineProperty(anonymous, "name", { value: "" });
    expect(formatValue(anonymous)).toBe("anonymous");
  });

  it("summarizes cyclic containers without traversing or serializing their contents", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(formatValue(value)).toBe("1 properties");
    const map = new Map();
    map.set("self", map);
    expect(formatValue(map)).toBe("1 entries");
  });

  it("keeps the full formatted text in the tooltip", () => {
    const value = "A long variable value with <tags> and a newline\nnext line";
    const preview =
      '"A long variable value with <tags> and a newline\\nnext line"';
    render(<ValuePreview value={value} />);

    expect(screen.getByTitle(preview).textContent).toBe(preview);
  });
});
