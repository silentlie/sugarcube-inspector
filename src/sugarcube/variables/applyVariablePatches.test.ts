import { describe, expect, it, vi } from "vitest";
import { applyVariablePatches } from "./applyVariablePatches";
import type { PathSegment, VariablePatch } from "../watch/types";
import type { SugarCubeSnapshot } from "../types";

type Stores = SugarCubeSnapshot["variables"];

const change = (segments: PathSegment[], value: unknown): VariablePatch => ({
  op: "set", path: [{ type: "property", key: "story" }, ...segments], value,
});
const prop = (key: string) => ({ type: "property" as const, key });
const snapshot = (story: Record<string, unknown>): Stores => ({
  story, temporary: {},
});

describe("in-place variable patches", () => {
  it("uses the first path element to select the scope, including root replacement", () => {
    const originalTemporary = { score: 2 };
    const stores = { story: { score: 1 }, temporary: originalTemporary };
    const result = applyVariablePatches(stores, [
      { op: "set", path: [{ type: "property", key: "temporary" }], value: { score: 3 } },
      { op: "set", path: [{ type: "property", key: "story" }, prop("score")], value: 4 },
    ]);
    expect(result).toBe(stores);
    expect(result.story).toEqual({ score: 4 });
    expect(result.temporary).toEqual({ score: 3 });
    expect(result.temporary).not.toBe(originalTemporary);
  });

  it("preserves sparse-array holes, named and symbol properties, and nonenumerable metadata", () => {
    const array: unknown[] = [];
    array.length = 5;
    array[3] = "map";
    const marker = Symbol("marker");
    Object.defineProperty(array, "category", {
      value: "loot", enumerable: true, writable: true, configurable: true,
    });
    Object.defineProperty(array, "hidden", {
      value: 42, enumerable: false, writable: true, configurable: true,
    });
    Object.defineProperty(array, marker, {
      value: "flag", enumerable: false, writable: true, configurable: true,
    });

    const initial = snapshot({ inventory: array });
    const updated = applyVariablePatches(initial, [
      change([prop("inventory"), prop("3")], "compass"),
    ]);
    const next = (updated.story as Record<string, unknown>).inventory as
      Array<unknown> & { category: string; hidden: number; [marker]: string };

    expect(next).toBe(array);
    expect(next.length).toBe(5);
    expect(Object.hasOwn(next, 0)).toBe(false);
    expect(Object.hasOwn(next, 2)).toBe(false);
    expect(next[3]).toBe("compass");
    expect(next.category).toBe("loot");
    expect(next.hidden).toBe(42);
    expect(next[marker]).toBe("flag");
    expect(Object.getOwnPropertyDescriptor(next, "hidden")?.enumerable).toBe(false);
    expect(array[3]).toBe("compass");
  });

  it("preserves holes and extra properties on index deletion and length changes", () => {
    const arr = ["map", "key"];
    Object.defineProperty(arr, "category", {
      value: "loot", enumerable: true, configurable: true, writable: true,
    });
    const initial = snapshot({ inventory: arr });
    const withoutIndex = applyVariablePatches(initial, [{
      op: "delete", path: [{ type: "property", key: "story" }, prop("inventory"), prop("0")],
    }]);
    const next = (withoutIndex.story as Record<string, unknown>).inventory as string[];
    expect(Object.hasOwn(next, 0)).toBe(false);
    expect(next.length).toBe(2);
    expect((next as unknown as { category: string }).category).toBe("loot");
    expect(Object.hasOwn(arr, 0)).toBe(false);

    const extended = applyVariablePatches(withoutIndex, [
      change([prop("inventory"), prop("length")], 4),
    ]);
    const result = (extended.story as Record<string, unknown>).inventory as string[];
    expect(result.length).toBe(4);
    expect(Object.hasOwn(result, 3)).toBe(false);
    expect((result as unknown as { category: string }).category).toBe("loot");
  });

  it("does not invent an object when an array ancestor is missing", () => {
    const initial = snapshot({});
    const nested = change([prop("inventory"), prop("0")], "sword");
    expect(() => applyVariablePatches(initial, [nested])).toThrow(
      "Cannot apply a variable patch through a missing or non-object ancestor.",
    );
    expect(initial.story).toEqual({});

    applyVariablePatches(initial, [change([prop("inventory")], ["sword"])]);
    expect(Array.isArray((initial.story as Record<string, unknown>).inventory)).toBe(true);
    expect((initial.story as Record<string, unknown>).inventory).toEqual(["sword"]);
  });

  it("preserves an own __proto__ key as data rather than changing the prototype", () => {
    const player = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(player, "__proto__", {
      value: "literal", enumerable: true, configurable: true, writable: true,
    });
    player.health = 10;
    const initial = snapshot({ player });
    const changed = applyVariablePatches(initial, [
      change([prop("player"), prop("health")], 20),
    ]);
    const next = (changed.story as Record<string, unknown>).player as Record<string, unknown>;
    expect(Object.getPrototypeOf(next)).toBeNull();
    expect(Object.hasOwn(next, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(next, "__proto__")?.value).toBe("literal");
    expect(next.health).toBe(20);
    expect(player.health).toBe(20);

    const replaced = applyVariablePatches(changed, [
      change([prop("player"), prop("__proto__")], { note: "updated" }),
    ]);
    const after = (replaced.story as Record<string, unknown>).player as Record<string, unknown>;
    expect(Object.getPrototypeOf(after)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(after, "__proto__")?.value).toEqual({ note: "updated" });
  });

  it("updates an existing data property without changing its descriptor flags", () => {
    const player = {};
    Object.defineProperty(player, "health", {
      value: 10, writable: true, enumerable: false, configurable: false,
    });

    applyVariablePatches(snapshot({ player }), [
      change([prop("player"), prop("health")], 20),
    ]);

    expect(Object.getOwnPropertyDescriptor(player, "health")).toEqual({
      value: 20, writable: true, enumerable: false, configurable: false,
    });
  });

  it("rejects changed values for non-writable properties", () => {
    const player = {};
    Object.defineProperty(player, "health", {
      value: 10, writable: false, enumerable: true, configurable: false,
    });
    const stores = snapshot({ player });

    expect(() => applyVariablePatches(stores, [
      change([prop("player"), prop("health")], 20),
    ])).toThrow(TypeError);
    expect(Object.getOwnPropertyDescriptor(player, "health")?.value).toBe(10);
  });

  it("replaces configurable accessors without invoking their setters", () => {
    let setterCalls = 0;
    const player = {};
    Object.defineProperty(player, "health", {
      get: () => 10,
      set: () => { setterCalls++; },
      enumerable: false,
      configurable: true,
    });

    applyVariablePatches(snapshot({ player }), [
      change([prop("player"), prop("health")], 20),
    ]);

    expect(setterCalls).toBe(0);
    expect(Object.getOwnPropertyDescriptor(player, "health")).toEqual({
      value: 20, writable: true, enumerable: false, configurable: true,
    });
  });

  it("keeps nonenumerable and readonly property descriptors unchanged on other patches", () => {
    const player = { health: 10 };
    Object.defineProperty(player, "locked", {
      value: 1, enumerable: false, writable: false, configurable: false,
    });
    const next = applyVariablePatches(snapshot({ player }), [
      change([prop("player"), prop("health")], 20),
    ]);
    const result = (next.story as Record<string, unknown>).player;
    expect(Object.getOwnPropertyDescriptor(result, "locked")).toEqual({
      value: 1, enumerable: false, writable: false, configurable: false,
    });
    expect((result as { health: number }).health).toBe(20);
  });

  it("preserves special constructor and prototype keys on nested patches", () => {
    const player = { health: 10 } as Record<string, unknown>;
    Object.defineProperty(player, "constructor", {
      value: "literal-constructor", enumerable: true, writable: true, configurable: true,
    });
    Object.defineProperty(player, "prototype", {
      value: "literal-prototype", enumerable: true, writable: true, configurable: true,
    });
    const updated = applyVariablePatches(snapshot({ player }), [
      change([prop("player"), prop("health")], 42),
    ]);
    const result = (updated.story as Record<string, unknown>).player as Record<string, unknown>;
    expect(result.constructor).toBe("literal-constructor");
    expect(result.prototype).toBe("literal-prototype");
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("replaces a whole watched object, breaking old aliases but retaining cloned cycles", () => {
    const player: Record<string, unknown> = { health: 10 };
    player.self = player;
    const initial = snapshot({ player, alias: player });

    // A nested property patch still updates its existing parent in place.
    expect(applyVariablePatches(initial, [
      change([prop("player"), prop("health")], 20),
    ])).toBe(initial);
    expect(player.health).toBe(20);
    expect((initial.story as Record<string, unknown>).alias).toBe(player);

    const replacement: Record<string, unknown> = { health: 30, mp: 5 };
    replacement.self = replacement;
    const cloned = structuredClone(replacement);
    applyVariablePatches(initial, [change([prop("player")], cloned)]);

    const story = initial.story as Record<string, unknown>;
    expect(story.player).toBe(cloned);
    expect(story.player).not.toBe(player);
    expect(story.alias).toBe(player);
    expect(player.health).toBe(20);
    expect((story.player as Record<string, unknown>).self).toBe(story.player);
    expect(player.self).toBe(player);
  });

  it("replaces whole Map and Set values without mutating their previous aliases", () => {
    const oldMap = new Map([["one", 1]]);
    const oldSet = new Set(["one"]);
    const initial = snapshot({
      map: oldMap, mapAlias: oldMap, set: oldSet, setAlias: oldSet,
    });
    const newMap = new Map([["two", 2]]);
    const newSet = new Set(["two"]);
    applyVariablePatches(initial, [
      change([prop("map")], newMap),
      change([prop("set")], newSet),
    ]);
    const story = initial.story as Record<string, unknown>;
    expect(story.map).toBe(newMap);
    expect(story.mapAlias).toBe(oldMap);
    expect(story.set).toBe(newSet);
    expect(story.setAlias).toBe(oldSet);
    expect(oldMap).toEqual(new Map([["one", 1]]));
    expect(oldSet).toEqual(new Set(["one"]));
  });

  it("writes a new __proto__ property without modifying Object.prototype", () => {
    const player = { health: 10 } as Record<string, unknown>;
    const initial = snapshot({ player });
    const before = Object.keys(Object.prototype);
    applyVariablePatches(initial, [change([prop("player"), prop("__proto__")], { bonus: 3 })]);
    expect(Object.getPrototypeOf(player)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(player, "__proto__")?.value).toEqual({ bonus: 3 });
    expect(Object.keys(Object.prototype)).toEqual(before);
  });

  it("treats deletion of a missing final property as an idempotent no-op", () => {
    const shared = { health: 100 };
    const stores = snapshot({ player: shared, leader: shared });

    const deleteHealth = (name: string): VariablePatch => ({
      op: "delete",
      path: [{ type: "property", key: "story" }, prop(name), prop("health")],
    });

    applyVariablePatches(stores, [deleteHealth("player"), deleteHealth("leader")]);
    expect(shared).toEqual({});
    expect(Object.hasOwn(shared, "health")).toBe(false);

    expect(() => applyVariablePatches(stores, [deleteHealth("player")])).not.toThrow();
    expect(stores.story).toEqual({ player: shared, leader: shared });
  });

  it("rejects deletion through a missing or undefined intermediate property", () => {
    const stores = snapshot({ player: undefined });
    const missingParent: VariablePatch = {
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("absent"), prop("health")],
    };
    const undefinedParent: VariablePatch = {
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("player"), prop("health")],
    };

    expect(() => applyVariablePatches(stores, [missingParent])).toThrow(
      "Variable patch ancestor does not exist.",
    );
    expect(() => applyVariablePatches(stores, [undefinedParent])).toThrow(TypeError);
    expect(stores.story).toEqual({ player: undefined });
  });

  it("rejects deletion through a primitive ancestor", () => {
    const stores = snapshot({ player: 42 });
    expect(() => applyVariablePatches(stores, [{
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("player"), prop("health")],
    }])).toThrow(TypeError);
    expect(stores.story).toEqual({ player: 42 });
  });

  it("throws on Map and Set type mismatches instead of silently skipping patches", () => {
    const stores = snapshot({ map: {}, set: [] });
    const badMap: VariablePatch = {
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("map"), { type: "mapValue", index: 0 }],
    };
    const badSet: VariablePatch = {
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("set"), { type: "setValue", index: 0 }],
    };

    expect(() => applyVariablePatches(stores, [badMap])).toThrow(TypeError);
    expect(() => applyVariablePatches(stores, [badSet])).toThrow(TypeError);
    expect(() => applyVariablePatches(stores, [{ ...badMap, op: "set", value: 42 }])).toThrow(TypeError);
    expect(() => applyVariablePatches(stores, [{ ...badSet, op: "set", value: 42 }])).toThrow(TypeError);
    expect(stores.story).toEqual({ map: {}, set: [] });
  });

  it("throws on invalid Map and Set entry indices without changing either collection", () => {
    const map = new Map([["hero", { hp: 10 }]]);
    const set = new Set([{ hp: 10 }]);
    const stores = snapshot({ map, set });

    for (const index of [-1, 1, 0.5, Number.NaN]) {
      for (const type of ["mapKey", "mapValue", "setValue"] as const) {
        const collection = type === "setValue" ? "set" : "map";
        const path: VariablePatch["path"] = [
          { type: "property", key: "story" },
          prop(collection),
          { type, index },
        ];
        expect(() => applyVariablePatches(stores, [{ op: "delete", path }])).toThrow(RangeError);
        expect(() => applyVariablePatches(stores, [{ op: "set", path, value: "replacement" }])).toThrow(RangeError);
      }
    }

    expect([...map]).toEqual([["hero", { hp: 10 }]]);
    expect([...set]).toEqual([{ hp: 10 }]);
  });

  it("still deletes valid Map and Set entries and their nested properties", () => {
    const map = new Map([["hero", { hp: 10 }]]);
    const set = new Set([{ hp: 10 }]);
    const stores = snapshot({ map, set });
    const mapPath: VariablePatch["path"] = [
      { type: "property", key: "story" }, prop("map"), { type: "mapValue", index: 0 },
    ];
    const setPath: VariablePatch["path"] = [
      { type: "property", key: "story" }, prop("set"), { type: "setValue", index: 0 },
    ];

    applyVariablePatches(stores, [
      { op: "delete", path: [...mapPath, prop("hp")] },
      { op: "delete", path: [...setPath, prop("hp")] },
    ]);
    expect([...map.values()]).toEqual([{}]);
    expect([...set.values()]).toEqual([{}]);

    applyVariablePatches(stores, [
      { op: "delete", path: mapPath },
      { op: "delete", path: setPath },
    ]);
    expect(map.size).toBe(0);
    expect(set.size).toBe(0);
  });

  it("rejects deletion of the non-configurable array length property", () => {
    const inventory = ["sword", "shield"];
    const stores = snapshot({ inventory });

    expect(() => applyVariablePatches(stores, [{
      op: "delete",
      path: [{ type: "property", key: "story" }, prop("inventory"), prop("length")],
    }])).toThrow(TypeError);

    expect(inventory).toEqual(["sword", "shield"]);
    expect(inventory.length).toBe(2);
  });

  it("applies terminal and nested Map and Set updates", () => {
    const map = new Map([["hero", { hp: 10 }]]);
    const set = new Set([{ hp: 10 }]);
    const stores = snapshot({ map, set });
    const scope = { type: "property" as const, key: "story" as const };

    applyVariablePatches(stores, [
      { op: "set", path: [scope, prop("map"), { type: "mapKey", index: 0 }], value: "player" },
      { op: "set", path: [scope, prop("map"), { type: "mapValue", index: 0 }, prop("hp")], value: 20 },
      { op: "set", path: [scope, prop("set"), { type: "setValue", index: 0 }, prop("hp")], value: 30 },
    ]);
    expect([...map]).toEqual([["player", { hp: 20 }]]);
    expect([...set]).toEqual([{ hp: 30 }]);

    applyVariablePatches(stores, [
      { op: "set", path: [scope, prop("map"), { type: "mapValue", index: 0 }], value: { hp: 40 } },
      { op: "set", path: [scope, prop("set"), { type: "setValue", index: 0 }], value: { hp: 50 } },
    ]);
    expect([...map]).toEqual([["player", { hp: 40 }]]);
    expect([...set]).toEqual([{ hp: 50 }]);
  });


  it("updates and deletes Map entries without rebuilding the Map", () => {
    const key = { id: "old" };
    const value = { hp: 10 };
    const map = new Map<unknown, unknown>([[key, value], ["second", 2], ["third", 3]]);
    const clear = vi.spyOn(map, "clear");
    const stores = snapshot({ map });

    applyVariablePatches(stores, [
      change([prop("map"), { type: "mapKey", index: 0 }, prop("id")], "new"),
      change([prop("map"), { type: "mapValue", index: 0 }, prop("hp")], 20),
      change([prop("map"), { type: "mapValue", index: 1 }], 4),
      { op: "delete", path: [{ type: "property", key: "story" }, prop("map"), { type: "mapKey", index: 2 }] },
    ]);

    expect(clear).not.toHaveBeenCalled();
    expect([...map]).toEqual([[key, value], ["second", 4]]);
    expect([...map.keys()][0]).toBe(key);
    expect(map.get(key)).toBe(value);
    expect(key.id).toBe("new");
    expect(value.hp).toBe(20);
  });

  it("mutates nested Set values and deletes members without rebuilding the Set", () => {
    const first = { hp: 10 };
    const second = { hp: 20 };
    const third = { hp: 30 };
    const set = new Set([first, second, third]);
    const clear = vi.spyOn(set, "clear");
    const stores = snapshot({ set });

    applyVariablePatches(stores, [
      change([prop("set"), { type: "setValue", index: 0 }, prop("hp")], 15),
      { op: "delete", path: [{ type: "property", key: "story" }, prop("set"), { type: "setValue", index: 1 }] },
    ]);

    expect(clear).not.toHaveBeenCalled();
    expect([...set]).toEqual([first, third]);
    expect([...set][0]).toBe(first);
    expect(first.hp).toBe(15);
    expect(set.has(second)).toBe(false);
  });

  it("preserves Map and Set entry order when replacing a key or member", () => {
    const map = new Map([["first", 1], ["second", 2], ["third", 3]]);
    const set = new Set(["first", "second", "third"]);
    const mapClear = vi.spyOn(map, "clear");
    const setClear = vi.spyOn(set, "clear");

    applyVariablePatches(snapshot({ map, set }), [
      change([prop("map"), { type: "mapKey", index: 1 }], "replacement"),
      change([prop("set"), { type: "setValue", index: 1 }], "replacement"),
    ]);

    expect([...map]).toEqual([["first", 1], ["replacement", 2], ["third", 3]]);
    expect([...set]).toEqual(["first", "replacement", "third"]);
    expect(mapClear).toHaveBeenCalledTimes(1);
    expect(setClear).toHaveBeenCalledTimes(1);
  });

  it("keeps native Map and Set uniqueness when replacements collide", () => {
    const map = new Map([["first", 1], ["second", 2], ["third", 3]]);
    const set = new Set(["first", "second", "third"]);

    applyVariablePatches(snapshot({ map, set }), [
      change([prop("map"), { type: "mapKey", index: 1 }], "first"),
      change([prop("set"), { type: "setValue", index: 1 }], "first"),
    ]);

    expect([...map]).toEqual([["first", 2], ["third", 3]]);
    expect([...set]).toEqual(["first", "third"]);
  });

  it("retains collection-specific errors while traversing nested Map and Set members", () => {
    const map = new Map([["hero", { hp: 10 }]]);
    const set = new Set([{ hp: 10 }]);
    const stores = snapshot({ map, set, notMap: {}, notSet: [] });

    for (const type of ["mapKey", "mapValue", "setValue"] as const) {
      const collection = type === "setValue" ? "set" : "map";
      const path: VariablePatch["path"] = [
        { type: "property", key: "story" },
        prop(collection),
        { type, index: 1 },
        prop("hp"),
      ];
      expect(() => applyVariablePatches(stores, [{ op: "set", path, value: 20 }]))
        .toThrow(RangeError);

      const wrongTypePath: VariablePatch["path"] = [
        { type: "property", key: "story" },
        prop(type === "setValue" ? "notSet" : "notMap"),
        { type, index: 0 },
        prop("hp"),
      ];
      expect(() => applyVariablePatches(stores, [
        { op: "set", path: wrongTypePath, value: 20 },
      ])).toThrow(TypeError);
    }

    expect([...map]).toEqual([["hero", { hp: 10 }]]);
    expect([...set]).toEqual([{ hp: 10 }]);
  });

  it("preserves accessor conversion when updating a nested property", () => {
    const child = { hp: 10 };
    const player = {};
    Object.defineProperty(player, "child", {
      get: () => child,
      enumerable: false,
      configurable: true,
    });

    applyVariablePatches(snapshot({ player }), [
      change([prop("player"), prop("child"), prop("hp")], 20),
    ]);

    expect(child.hp).toBe(20);
    expect(Object.getOwnPropertyDescriptor(player, "child")).toEqual({
      value: child, writable: true, enumerable: false, configurable: true,
    });
  });

  it("throws instead of silently ignoring deletion of a nonconfigurable property", () => {
    const player = {};
    Object.defineProperty(player, "locked", {
      value: 1, enumerable: true, configurable: false, writable: false,
    });
    expect(() => applyVariablePatches(snapshot({ player }), [{
      op: "delete", path: [{ type: "property", key: "story" }, prop("player"), prop("locked")],
    }])).toThrow(TypeError);
  });
});
