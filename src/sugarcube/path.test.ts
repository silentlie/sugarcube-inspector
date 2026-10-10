import { describe, expect, it } from "vitest";
import {
  isPathPrefix,
  normalizeCollectionPath,
  pathKey,
  readPathChild,
  resolvePath,
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
    expect(readPathChild(player, prop("inherited")).exists).toBe(false);
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
    expect(readPathChild(items, { type: "index", index: 0 }).exists).toBe(false);
    expect(readPathChild(items, { type: "index", index: 1 })).toEqual({
      exists: true, value: undefined,
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
