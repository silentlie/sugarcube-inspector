import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeInspection, inspectExpression, inspectInPage, type InspectPath } from "./lazyInspection";

const root: InspectPath = { root: "story", segments: [] };
function inspect(path: InspectPath, offset = 0) {
  // Execute the *actual generated expression*, not just the source function.
  const result: unknown = new Function(`return ${inspectExpression(path, offset)}`)();
  return decodeInspection(result);
}

afterEach(() => vi.unstubAllGlobals());

describe("one-level live page inspection", () => {
  it("reads values without invoking ordinary getters or cloning the object graph", () => {
    const getter = vi.fn(() => 123);
    const data = { day: 2, person: { name: "MC" }, heal: () => {} };
    const circular = { data } as { data: typeof data; self?: unknown };
    circular.self = circular;
    const variables: Record<string, unknown> = { ...data, circular };
    Object.defineProperty(variables, "computed", { get: getter, enumerable: true });
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });

    const result = inspect(root);
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "day", preview: "2", expandable: false }),
      expect.objectContaining({ name: "person", preview: "Object", expandable: true }),
      expect.objectContaining({ name: "heal", preview: "[Function]", expandable: true }),
      expect.objectContaining({ name: "circular", expandable: true }),
    ]));
    expect(getter).not.toHaveBeenCalled();
    const nested = inspect({ root: "story", segments: [{ kind: "property", key: "circular" }] });
    expect(nested.entries.map((entry) => entry.name)).toContain("self");
  });

  it("does not execute accessor getters during direct traversal", () => {
    const getter = vi.fn(() => ({ value: 10 }));
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, "computed", { get: getter, enumerable: true });
    vi.stubGlobal("SugarCube", { State: { variables: data, temporary: {} } });

    expect(inspect(root).entries).toEqual([
      expect.objectContaining({
        name: "computed", preview: "[getter]", accessor: "getter", expandable: false,
      }),
    ]);
    expect(getter).not.toHaveBeenCalled();
  });

  it("reads Map keys, Map values, Set members, and symbols lazily", () => {
    const symbol = Symbol("tag");
    const story = {
      map: new Map([[{ id: 1 }, new Set(["a", "b"])]]),
      collection: new Set([{ live: true }]),
      [symbol]: "symbolic",
    };
    vi.stubGlobal("SugarCube", { State: { variables: story, temporary: { choice: "south" } } });
    const list = inspect(root);
    expect(list.entries.map((entry) => entry.name)).toContain("Symbol(tag)");
    const map = inspect({ root: "story", segments: [{ kind: "property", key: "map" }] });
    expect(map.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "[0] key", preview: "Object" }),
      expect.objectContaining({ name: "[0] value", preview: "Set(2)" }),
    ]));
    const mapKey = inspect({ root: "story", segments: [
      { kind: "property", key: "map" }, { kind: "mapKey", index: 0 },
    ] });
    expect(mapKey.entries).toEqual([expect.objectContaining({ name: "id", preview: "1" })]);
    const member = inspect({ root: "story", segments: [
      { kind: "property", key: "collection" }, { kind: "setValue", index: 0 },
    ] });
    expect(member.entries[0]).toEqual(expect.objectContaining({ name: "live", preview: "true" }));
    expect(inspect({ root: "temporary", segments: [] }).entries[0])
      .toEqual(expect.objectContaining({ name: "choice", preview: '"south"' }));
  });

  it("returns bounded pages without copying nested child graphs", () => {
    const variables = Object.fromEntries(Array.from({ length: 145 }, (_, i) => [`v${i}`, i]));
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
    const first = inspect(root);
    const second = inspect(root, 100);
    expect(first.entries).toHaveLength(100);
    expect(second.entries).toHaveLength(45);
    expect(first.total).toBe(145);
  });

  it("returns readable errors for missing paths", () => {
    vi.stubGlobal("SugarCube", { State: { variables: {}, temporary: {} } });
    const missing = { root: "story" as const, segments: [{ kind: "property" as const, key: "missing" }] };
    expect(() => inspect(missing)).toThrow("Property no longer exists.");
  });

  it("uses a self-contained source expression", () => {
    vi.stubGlobal("SugarCube", { State: { variables: { health: 100 }, temporary: {} } });
    const value = inspectInPage(root, 0);
    expect(JSON.parse(value).entries[0].preview).toBe("100");
    expect(inspect(root).entries[0]?.preview).toBe("100");
  });
});
