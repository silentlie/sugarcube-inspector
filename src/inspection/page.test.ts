import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeInspection, inspectInPage } from "./page";
import type { Path } from "./protocol";

const root: Path = { root: "story", segments: [] };
const read = (path: Path) => decodeInspection(inspectInPage(path, 0));

afterEach(() => vi.unstubAllGlobals());

describe("live MAIN-world descriptor inspection", () => {
  it("reads live data without calling getter functions or cloning functions", () => {
    const getter = vi.fn(() => 33);
    const obj: Record<string, unknown> = {
      health: 80,
      heal() {},
      map: new Map([["hp", 80]]),
    };
    Object.defineProperty(obj, "computed", { get: getter, enumerable: true });
    obj.self = obj;
    vi.stubGlobal("SugarCube", { State: { variables: obj, temporary: {} } });

    expect(read(root).entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "health", preview: "80" }),
      expect.objectContaining({ name: "heal", preview: "[Function]" }),
      expect.objectContaining({ name: "computed", preview: "[getter]" }),
      expect.objectContaining({ name: "self", expandable: true }),
    ]));
    expect(getter).not.toHaveBeenCalled();
    expect(read({ root: "story", segments: [{ kind: "property", key: "self" }] })
      .entries.map(e => e.name)).toContain("health");
  });

  it("omits absent optional fields even if the game serializes undefined as arrays", () => {
    const getter = vi.fn(() => 33);
    const variables = { day: 2 };
    Object.defineProperty(variables, "computed", { get: getter, enumerable: false });
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });

    // Some SugarCube stories override JSON.stringify to transform undefined.
    const stringify = JSON.stringify;
    vi.stubGlobal("JSON", {
      ...JSON,
      stringify(value: unknown) {
        return stringify(value, (_key, item) => item === undefined ? [] : item);
      },
    });

    const entries = read(root).entries;
    expect(entries.find((entry) => entry.name === "day")).toEqual({
      name: "day",
      segment: { kind: "property", key: "day" },
      preview: "2",
      expandable: false,
    });
    expect(entries.find((entry) => entry.name === "computed")).toEqual({
      name: "computed",
      segment: { kind: "property", key: "computed" },
      preview: "[getter]",
      expandable: false,
      nonEnumerable: true,
      accessor: "getter",
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("inspects nested Map and Set entries on demand", () => {
    vi.stubGlobal("SugarCube", { State: { variables: {
      map: new Map([["value", new Set(["one"])]]),
    }, temporary: { choice: "north" } } });
    const values = read({ root: "story", segments: [{ kind: "property", key: "map" }] });
    expect(values.entries.map(e => e.name)).toContain("[0] value");
    expect(values.entries.find(e => e.name === "[0] value")?.preview).toBe("Set(1)");
    expect(read({ root: "temporary", segments: [] }).entries[0]?.preview)
      .toBe('"north"');
  });
});
