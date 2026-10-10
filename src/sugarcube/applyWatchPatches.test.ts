import { describe, expect, it } from "vitest";
import { applyWatchPatches } from "./applyWatchPatches";
import type { WatchPatch } from "./watch";
import type { SugarCubeSnapshot } from "./types";

type Stores = SugarCubeSnapshot["variables"];

const change = (path: WatchPatch["path"], value: unknown): WatchPatch => ({
  op: "set", scope: "story", path, value,
});
const prop = (key: string) => ({ type: "property" as const, key });
const index = (at: number) => ({ type: "index" as const, index: at });
const snapshot = (story: Record<string, unknown>): Stores => ({
  story, temporary: {},
});

describe("in-place watch patches", () => {
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
    const updated = applyWatchPatches(initial, [
      change([prop("inventory"), index(3)], "compass"),
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
    const withoutIndex = applyWatchPatches(initial, [{
      op: "delete", scope: "story", path: [prop("inventory"), index(0)],
    }]);
    const next = (withoutIndex.story as Record<string, unknown>).inventory as string[];
    expect(Object.hasOwn(next, 0)).toBe(false);
    expect(next.length).toBe(2);
    expect((next as unknown as { category: string }).category).toBe("loot");
    expect(Object.hasOwn(arr, 0)).toBe(false);

    const extended = applyWatchPatches(withoutIndex, [
      change([prop("inventory"), prop("length")], 4),
    ]);
    const result = (extended.story as Record<string, unknown>).inventory as string[];
    expect(result.length).toBe(4);
    expect(Object.hasOwn(result, 3)).toBe(false);
    expect((result as unknown as { category: string }).category).toBe("loot");
  });

  it("preserves an own __proto__ key as data rather than changing the prototype", () => {
    const player = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(player, "__proto__", {
      value: "literal", enumerable: true, configurable: true, writable: true,
    });
    player.health = 10;
    const initial = snapshot({ player });
    const changed = applyWatchPatches(initial, [
      change([prop("player"), prop("health")], 20),
    ]);
    const next = (changed.story as Record<string, unknown>).player as Record<string, unknown>;
    expect(Object.getPrototypeOf(next)).toBeNull();
    expect(Object.hasOwn(next, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(next, "__proto__")?.value).toBe("literal");
    expect(next.health).toBe(20);
    expect(player.health).toBe(20);

    const replaced = applyWatchPatches(changed, [
      change([prop("player"), prop("__proto__")], { note: "updated" }),
    ]);
    const after = (replaced.story as Record<string, unknown>).player as Record<string, unknown>;
    expect(Object.getPrototypeOf(after)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(after, "__proto__")?.value).toEqual({ note: "updated" });
  });

  it("keeps nonenumerable and readonly property descriptors unchanged on other patches", () => {
    const player = { health: 10 };
    Object.defineProperty(player, "locked", {
      value: 1, enumerable: false, writable: false, configurable: false,
    });
    const next = applyWatchPatches(snapshot({ player }), [
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
    const updated = applyWatchPatches(snapshot({ player }), [
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
    expect(applyWatchPatches(initial, [
      change([prop("player"), prop("health")], 20),
    ])).toBe(initial);
    expect(player.health).toBe(20);
    expect((initial.story as Record<string, unknown>).alias).toBe(player);

    const replacement: Record<string, unknown> = { health: 30, mp: 5 };
    replacement.self = replacement;
    const cloned = structuredClone(replacement);
    applyWatchPatches(initial, [change([prop("player")], cloned)]);

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
    applyWatchPatches(initial, [
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
    applyWatchPatches(initial, [change([prop("player"), prop("__proto__")], { bonus: 3 })]);
    expect(Object.getPrototypeOf(player)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(player, "__proto__")?.value).toEqual({ bonus: 3 });
    expect(Object.keys(Object.prototype)).toEqual(before);
  });

  it("throws instead of silently ignoring deletion of a nonconfigurable property", () => {
    const player = {};
    Object.defineProperty(player, "locked", {
      value: 1, enumerable: true, configurable: false, writable: false,
    });
    expect(() => applyWatchPatches(snapshot({ player }), [{
      op: "delete", scope: "story", path: [prop("player"), prop("locked")],
    }])).toThrow(TypeError);
  });
});
