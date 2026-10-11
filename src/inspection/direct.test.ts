import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore, incrementDirect, inspectDirect, isReference } from "./direct";

afterEach(() => vi.unstubAllGlobals());

describe("direct MAIN-world references", () => {
  it("returns actual live references and preserves aliases and cycles", () => {
    const player = { health: 100 };
    const store = { player, leader: player, self: null as unknown };
    store.self = store;
    vi.stubGlobal("SugarCube", { State: { variables: store, temporary: {} } });
    expect(getStore("story")).toBe(store);

    const entries = inspectDirect(getStore("story"));
    const playerEntry = entries.find((entry) => entry.name === "player")!;
    const aliasEntry = entries.find((entry) => entry.name === "leader")!;
    const selfEntry = entries.find((entry) => entry.name === "self")!;

    expect(playerEntry.value).toBe(player);
    expect(aliasEntry.value).toBe(player);
    expect(selfEntry.value).toBe(store);
    expect(isReference(playerEntry.value)).toBe(true);
    expect(inspectDirect(playerEntry.value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "health", value: 100 }),
    ]));
  });

  it("writes directly to the original SugarCube object", () => {
    const player = { health: 100 };
    const store = { player };
    vi.stubGlobal("SugarCube", { State: { variables: store, temporary: {} } });

    const entry = inspectDirect(player).find((item) => item.name === "health")!;
    incrementDirect(entry);

    expect(store.player.health).toBe(101);
    expect(getStore("story")).toBe(store);
  });

  it("does not invoke getters while listing properties", () => {
    const getter = vi.fn(() => 10);
    const store = { score: 7 };
    Object.defineProperty(store, "computed", { get: getter, enumerable: true });
    const entries = inspectDirect(store);
    expect(entries.find((e) => e.name === "computed")).toEqual(expect.objectContaining({
      accessor: "getter", preview: "[getter]", incrementable: false,
    }));
    expect(getter).not.toHaveBeenCalled();
  });

  it("does not expose mutation for readonly numbers", () => {
    const store = {};
    Object.defineProperty(store, "readonly", {
      configurable: true, enumerable: true, writable: false, value: 5,
    });
    const entry = inspectDirect(store)[0]!;
    expect(entry.incrementable).toBe(false);
    expect(() => incrementDirect(entry)).toThrow("cannot be incremented");
  });

  it("inspects Maps, Sets and function objects without serializing them", () => {
    const fn = () => 1;
    const root = { fn, map: new Map([["key", new Set([1])]]) };
    const entries = inspectDirect(root);
    expect(entries.find((e) => e.name === "fn")?.value).toBe(fn);
    expect(inspectDirect(root.map).map((e) => e.name)).toEqual([
      "[0] key", "[0] value",
    ]);
  });
});
