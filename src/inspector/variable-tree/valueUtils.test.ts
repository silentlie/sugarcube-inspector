import { describe, expect, it } from "vitest";
import {
  getChildren,
  getValueType,
  formatVariablePath,
  isCircular,
  isExpandable,
} from "./valueUtils";

describe("circular-reference path labels", () => {
  it("formats scope roots, nested properties, and special keys", () => {
    expect(formatVariablePath("story", [])).toBe("$");
    expect(formatVariablePath("temporary", [{ type: "property", key: "choice" }]))
      .toBe("_choice");
    expect(formatVariablePath("story", [
      { type: "property", key: "player" },
      { type: "property", key: "a.b" },
      { type: "index", index: 2 },
    ])).toBe('$player["a.b"][2]');
  });
});

describe("expandable variable values", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["number", 7],
    ["boolean", false],
    ["string", "map"],
    ["bigint", 7n],
    ["symbol", Symbol("item")],
    ["function", () => {}],
    ["Date", new Date("2026-10-09T00:00:00Z")],
    ["RegExp", /map/],
    ["Error", new Error("missing")],
    ["ArrayBuffer", new ArrayBuffer(8)],
    ["typed array", new Uint8Array([1, 2])],
    ["DataView", new DataView(new ArrayBuffer(8))],
    ["WeakMap", new WeakMap()],
    ["WeakSet", new WeakSet()],
  ])("treats %s as a leaf", (_name, value) => {
    expect(isExpandable(value)).toBe(false);
    expect(getChildren(value)).toEqual([]);
  });

  it.each([
    ["empty object", {}],
    ["empty array", []],
    ["empty Map", new Map()],
    ["empty Set", new Set()],
  ])("allows expanding %s even without children", (_name, value) => {
    expect(isExpandable(value)).toBe(true);
    expect(getChildren(value)).toEqual([]);
  });

  it.each([
    ["object", { score: 7 }],
    ["array", ["map"]],
    ["Map", new Map([["score", 7]])],
    ["Set", new Set(["map"])],
  ])("offers children for a nonempty %s", (_name, value) => {
    expect(isExpandable(value)).toBe(true);
    expect(getChildren(value).length).toBeGreaterThan(0);
  });

  it("does not expand inherited or non-enumerable object properties", () => {
    const value = Object.create({ inherited: "hidden" });
    Object.defineProperty(value, "secret", {
      value: "hidden",
      enumerable: false,
    });
    expect(isExpandable(value)).toBe(true);
    Object.assign(value, { visible: 7 });

    expect(getChildren(value)).toEqual([
      {
        name: "visible",
        value: 7,
        segment: { type: "property", key: "visible" },
      },
    ]);
  });
});

describe("variable children and paths", () => {
  it("preserves literal object keys and child references", () => {
    const nested = { score: 7 };
    const value = { "a.b": nested, 'a["b"]': "literal", "0": "property" };
    const children = getChildren(value);

    expect(children).toEqual([
      { name: "0", value: "property", segment: { type: "property", key: "0" } },
      { name: "a.b", value: nested, segment: { type: "property", key: "a.b" } },
      {
        name: 'a["b"]',
        value: "literal",
        segment: { type: "property", key: 'a["b"]' },
      },
    ]);
    expect(children[1]!.value).toBe(nested);
  });

  it("distinguishes sparse array indices from named and out-of-range properties", () => {
    const value = ["map"];
    value[3] = "key";
    Object.assign(value, {
      "01": "named",
      "-1": "negative",
      "4294967295": "property",
    });

    expect(getChildren(value)).toEqual([
      { name: "[0]", value: "map", segment: { type: "index", index: 0 } },
      { name: "[3]", value: "key", segment: { type: "index", index: 3 } },
      { name: "01", value: "named", segment: { type: "property", key: "01" } },
      {
        name: "-1",
        value: "negative",
        segment: { type: "property", key: "-1" },
      },
      {
        name: "4294967295",
        value: "property",
        segment: { type: "property", key: "4294967295" },
      },
    ]);
  });

  it("gives Map keys and values different paths while preserving insertion order", () => {
    const key = { item: "map" };
    const entry = { count: 2 };
    const children = getChildren(
      new Map<unknown, unknown>([
        [key, entry],
        ["score", 7],
      ]),
    );

    expect(children).toEqual([
      { name: "[0].key", value: key, segment: { type: "mapKey", index: 0 } },
      {
        name: "[0].value",
        value: entry,
        segment: { type: "mapValue", index: 0 },
      },
      {
        name: "[1].key",
        value: "score",
        segment: { type: "mapKey", index: 1 },
      },
      { name: "[1].value", value: 7, segment: { type: "mapValue", index: 1 } },
    ]);
    expect(children[0]!.value).toBe(key);
    expect(children[1]!.value).toBe(entry);
  });

  it("assigns Set entry paths without cloning the entries", () => {
    const item = { name: "map" };
    const children = getChildren(new Set<unknown>([item, "key"]));

    expect(children).toEqual([
      { name: "[0]", value: item, segment: { type: "setValue", index: 0 } },
      { name: "[1]", value: "key", segment: { type: "setValue", index: 1 } },
    ]);
    expect(children[0]!.value).toBe(item);
  });
});

describe("circular references", () => {
  it("detects ancestor identity without marking a separate equal object as circular", () => {
    const ancestor = { score: 7 };
    expect(isCircular(ancestor, [ancestor])).toBe(true);
    expect(isCircular({ score: 7 }, [ancestor])).toBe(false);
    expect(isCircular(ancestor, [])).toBe(false);
    expect(isCircular(null, [ancestor])).toBe(false);
    expect(isCircular(7, [ancestor])).toBe(false);
  });
});

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
