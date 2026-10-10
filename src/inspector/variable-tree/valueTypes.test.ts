import { describe, expect, it } from "vitest";
import { getValueType } from "./valueTypes";

describe("variable type labels", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
    [7, "number"],
    [false, "boolean"],
    ["map", "string"],
    [7n, "bigint"],
    [Symbol("item"), "symbol"],
    [() => {}, "function"],
    [{}, "Object"],
    [[], "Array"],
    [new Map(), "Map"],
    [new Set(), "Set"],
    [new Date(), "Date"],
    [/map/, "RegExp"],
    [new TypeError("missing"), "TypeError"],
    [new ArrayBuffer(8), "ArrayBuffer"],
    [new Uint16Array(2), "Uint16Array"],
    [new DataView(new ArrayBuffer(8)), "DataView"],
  ])("labels %s as %s", (value, label) => {
    expect(getValueType(value)).toBe(label);
  });
});
