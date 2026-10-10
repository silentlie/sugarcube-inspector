import { describe, expect, it } from "vitest";
import {
  isPathPrefix,
  normalizeCollectionPath,
  pathKey,
  readPathChild,
  resolvePath,
  segmentForKey,
} from "./path";
import type { PathSegment, VariablePath } from "./watch";

const prop = (key: string): PathSegment => ({ type: "property", key });
const story = (...parts: PathSegment[]): VariablePath => [prop("story") as VariablePath[0], ...parts];

describe("shared path operations", () => {
  it("distinguishes existing undefined, missing own properties, and inherited properties", () => {
    const player = Object.create({ inherited: 5 }) as Record<string, unknown>;
    player.score = undefined;
    const stores = { story: { player }, temporary: {} };
    expect(resolvePath(stores, story(prop("player"), prop("score")))).toEqual({
      exists: true, value: undefined,
    });
    expect(resolvePath(stores, story(prop("player"), prop("missing")))).toEqual({
      exists: false, missingPath: story(prop("player"), prop("missing")),
    });
    expect(readPathChild(player, prop("inherited"))).toEqual({ status: "missing" });
    expect(readPathChild(player, prop("score"))).toEqual({ status: "found", value: undefined });
  });

  it("reports a blocked ancestor separately from a missing child", () => {
    const path = story(prop("player"), prop("hp"));
    const result = resolvePath({ story: { player: null }, temporary: {} }, path);
    expect(result).toEqual({
      exists: false,
      missingPath: story(prop("player")),
      blockedExists: true,
      blocked: null,
    });
    expect(resolvePath({ story: { player: {} }, temporary: {} }, path)).toEqual({
      exists: false, missingPath: path,
    });
  });

  it("preserves sparse-array holes and defined undefined entries", () => {
    const items = new Array<unknown>(2);
    items[1] = undefined;
    expect(readPathChild(items, { type: "index", index: 0 })).toEqual({ status: "missing" });
    expect(readPathChild(items, { type: "index", index: 1 })).toEqual({
      status: "found", value: undefined,
    });
  });

  it("resolves positional Map keys, Map values, and Set values", () => {
    const key = { id: 1 };
    const collection = new Map<unknown, unknown>([[key, undefined]]);
    const members = new Set<unknown>([undefined, key]);
    const stores = { story: { collection, members }, temporary: {} };
    expect(resolvePath(stores, story(prop("collection"), { type: "mapKey", index: 0 })).value).toBe(key);
    expect(resolvePath(stores, story(prop("collection"), { type: "mapValue", index: 0 }))).toEqual({
      exists: true, value: undefined,
    });
    expect(resolvePath(stores, story(prop("collection"), { type: "mapValue", index: 1 })).exists).toBe(false);
    expect(resolvePath(stores, story(prop("members"), { type: "setValue", index: 0 }))).toEqual({
      exists: true, value: undefined,
    });
    expect(resolvePath(stores, story(prop("members"), { type: "setValue", index: 2 })).exists).toBe(false);
  });

  it("distinguishes incompatible segment types from missing Map and Set entries", () => {
    const entry = { type: "mapValue" as const, index: 0 };
    const member = { type: "setValue" as const, index: 0 };
    expect(readPathChild({}, prop("hp"))).toEqual({ status: "missing" });
    expect(readPathChild(42, prop("hp"))).toEqual({ status: "blocked" });
    expect(readPathChild({}, entry)).toEqual({ status: "blocked" });
    expect(readPathChild(new Map(), entry)).toEqual({ status: "missing" });
    expect(readPathChild(new Map([["a", undefined]]), entry)).toEqual({
      status: "found", value: undefined,
    });
    expect(readPathChild({}, member)).toEqual({ status: "blocked" });
    expect(readPathChild(new Set(), member)).toEqual({ status: "missing" });
    expect(readPathChild(new Set([undefined]), member)).toEqual({
      status: "found", value: undefined,
    });
  });

  it("checks Map and Set entries by index, not by their contained values", () => {
    const map = new Map<unknown, unknown>([
      ["zero", 0],
      ["false", false],
      ["undefined", undefined],
    ]);
    const set = new Set<unknown>([0, false, undefined]);

    for (const index of [0, 1, 2]) {
      expect(readPathChild(map, { type: "mapValue", index })).toEqual({
        status: "found", value: [0, false, undefined][index],
      });
      expect(readPathChild(set, { type: "setValue", index })).toEqual({
        status: "found", value: [0, false, undefined][index],
      });
    }

    for (const index of [-1, 3, 100]) {
      expect(readPathChild(map, { type: "mapKey", index })).toEqual({ status: "missing" });
      expect(readPathChild(map, { type: "mapValue", index })).toEqual({ status: "missing" });
      expect(readPathChild(set, { type: "setValue", index })).toEqual({ status: "missing" });
    }
  });

  it("reads own properties through Reflect.get without changing existence rules", () => {
    const object = Object.create({ inherited: "ignored" }) as Record<string, unknown>;
    Object.defineProperty(object, "computed", { get: () => 42, enumerable: true });
    object["0"] = undefined;

    expect(readPathChild(object, prop("computed"))).toEqual({ status: "found", value: 42 });
    expect(readPathChild(object, { type: "index", index: 0 })).toEqual({
      status: "found", value: undefined,
    });
    expect(readPathChild(object, prop("inherited"))).toEqual({ status: "missing" });
  });

  it("generates canonical array indices and preserves named properties", () => {
    expect(segmentForKey("0", true)).toEqual({ type: "index", index: 0 });
    expect(segmentForKey("4294967294", true)).toEqual({ type: "index", index: 4294967294 });
    for (const key of ["01", "-1", "4294967295", "1.5", "foo"]) {
      expect(segmentForKey(key, true)).toEqual({ type: "property", key });
    }
    expect(segmentForKey("0", false)).toEqual({ type: "property", key: "0" });
  });

  it("keeps scope and segment types distinct when comparing paths", () => {
    const scope = story(prop("items"));
    const child = story(prop("items"), { type: "index", index: 0 });
    const property = story(prop("items"), prop("0"));
    const temporary: VariablePath = [{ type: "property", key: "temporary" }, prop("items")];
    expect(isPathPrefix(scope, child)).toBe(true);
    expect(isPathPrefix(child, scope)).toBe(false);
    expect(isPathPrefix(child, property)).toBe(false);
    expect(isPathPrefix(temporary, child)).toBe(false);
    expect(pathKey(child)).not.toBe(pathKey(property));
  });

  it("normalizes at the first Map/Set entry and leaves ordinary paths intact", () => {
    const collection = story(prop("maps"));
    const inside = story(
      prop("maps"),
      { type: "mapValue", index: 0 },
      prop("set"),
      { type: "setValue", index: 2 },
    );
    expect(normalizeCollectionPath(inside)).toEqual(collection);
    const regular = story(prop("player"), prop("hp"));
    expect(normalizeCollectionPath(regular)).toBe(regular);
  });
});
