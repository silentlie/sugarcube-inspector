import { afterEach, expect, it, vi } from "vitest";
import { inspectorSettingsKey } from "./favoriteStorage";
import { readStoryFavorites, writeStoryFavorites } from "./storySettings";

afterEach(() => vi.unstubAllGlobals());

it("creates enumerable story metadata and updates its favorites", () => {
  const variables = {};
  vi.stubGlobal("SugarCube", { State: { variables } });
  expect(readStoryFavorites()).toBeUndefined();
  writeStoryFavorites([{ root: "variables", path: ["score"] }]);
  expect(JSON.parse(JSON.stringify(variables))).toEqual({
    [inspectorSettingsKey]: { version: 1, favorites: [{ root: "variables", path: ["score"] }] },
  });
  writeStoryFavorites([]);
  expect(readStoryFavorites()).toEqual([]);
});

it("does not overwrite a conflicting story variable or invoke its getter", () => {
  const getter = vi.fn(() => "authored value");
  const variables = Object.defineProperty({}, inspectorSettingsKey, { get: getter });
  vi.stubGlobal("SugarCube", { State: { variables } });
  expect(() => writeStoryFavorites([])).toThrow("reserved inspector story variable");
  expect(getter).not.toHaveBeenCalled();
  expect(Object.getOwnPropertyDescriptor(variables, inspectorSettingsKey)?.get).toBe(getter);
});
