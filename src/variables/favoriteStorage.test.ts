// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { connectFavoriteStorage, favoriteStore } from "./favorites";
import { favoriteStorageEvents, inspectorSettingsKey } from "./favoriteStorage";
import { readStoryFavorites } from "./storySettings";
import { variableWatcher } from "./watcher";

let disconnect: (() => void) | undefined;

function connect() {
  vi.useFakeTimers();
  document.body.innerHTML = '<tw-storydata format="SugarCube" ifid="example-story"></tw-storydata>';
  vi.stubGlobal("location", { href: "file:///story.html" });
  const state = { active: {}, passage: "Start", turns: 1, variables: {} as Record<string, unknown>, temporary: {} };
  vi.stubGlobal("SugarCube", {
    State: state,
    Save: { onSave: { add: vi.fn(), delete: vi.fn() } },
  });
  disconnect = connectFavoriteStorage();
  return state;
}

afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  favoriteStore.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("merges delayed legacy favorites without undoing local pin changes", () => {
  connect();
  const added = { root: "variables" as const, path: ["score"] };
  const removed = { root: "variables" as const, path: ["removed"] };
  const legacy = { root: "temporary" as const, path: ["choice"] };
  favoriteStore.add(added);
  favoriteStore.add(removed);
  favoriteStore.remove(removed);

  document.dispatchEvent(new CustomEvent(favoriteStorageEvents.loaded, {
    detail: JSON.stringify([removed, legacy]),
  }));

  expect(readStoryFavorites()).toEqual([added, legacy]);
  expect(favoriteStore.getSnapshot().map(({ location: { root, path } }) => ({ root, path })))
    .toEqual([added, legacy]);
});

it("ignores a delayed legacy response after the story moment changes", () => {
  const state = connect();
  const current = { root: "variables" as const, path: ["current"] };
  state.active = {};
  state.variables = { [inspectorSettingsKey]: { version: 1, favorites: [current] } };
  variableWatcher.refresh();

  document.dispatchEvent(new CustomEvent(favoriteStorageEvents.loaded, {
    detail: JSON.stringify([{ root: "variables", path: ["old"] }]),
  }));

  expect(readStoryFavorites()).toEqual([current]);
  expect(favoriteStore.getSnapshot().map(({ location: { root, path } }) => ({ root, path })))
    .toEqual([current]);
});
