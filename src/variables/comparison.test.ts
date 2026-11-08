import { afterEach, expect, it, vi } from "vitest";
import { captureChildren, compareVariables, PolledChanges } from "./comparison";
import { VariableWatcher } from "./watcher";

afterEach(() => vi.unstubAllGlobals());
const root = { root: "variables" as const, path: [] };

it("compares direct primitives without getters or hidden metadata", () => {
  const getter = vi.fn(() => 100);
  const value: Record<string, unknown> = { score: 7, removed: true, complex: {}, __sugarcubeInspector: {} };
  Object.defineProperty(value, "getter", { get: getter });
  const before = captureChildren(root, value);
  value.score = "7";
  delete value.removed;
  value.added = false;
  const changes = compareVariables(before, captureChildren(root, value));
  expect(changes.map(({ path, kind }) => [path.path[0], kind])).toEqual([
    ["score", "changed"], ["removed", "removed"], ["added", "added"],
  ]);
  expect(changes[0]).toMatchObject({ before: { value: 7 }, after: { value: "7" } });
  expect(getter).not.toHaveBeenCalled();
});

it("compares nested replaced containers and distinguishes symbols sharing a description", () => {
  const a = Symbol("health");
  const b = Symbol("health");
  const path = { root: "variables" as const, path: ["player"] };
  const before = captureChildren(path, { [a]: 10, [b]: 30, health: 20 });
  const changes = compareVariables(before, captureChildren(path, { [a]: 11, [b]: 30, health: {} }));
  expect(changes).toHaveLength(2);
  expect(changes.find(({ path }) => path.path.at(-1) === a)?.path.path).toEqual(["player", a]);
  expect(changes.find(({ path }) => path.path.at(-1) === "health")).toMatchObject({ after: { kind: "other" } });
});

it("keeps full strings, signed zero and missing-path transitions", () => {
  const before = captureChildren(root, { text: "x".repeat(200), zero: -0 });
  const changes = compareVariables(before, captureChildren(root, { text: "x".repeat(200) + "changed", zero: 0 }));
  expect(changes).toHaveLength(2);
  expect(changes[0]?.before).toEqual({ kind: "value", value: "x".repeat(200) });
  expect(compareVariables(before, captureChildren(root, undefined))).toHaveLength(2);
});

it("deduplicates overlapping samples and retains only the latest hundred transitions", () => {
  vi.stubGlobal("SugarCube", { State: { turns: 2, passage: "Hall" } });
  const store = new PolledChanges();
  for (let value = 0; value < 105; value++) {
    const before = captureChildren(root, { score: value });
    const after = captureChildren(root, { score: value + 1 });
    const batch = {};
    store.observe(before, after, batch);
    store.observe(before, after, batch);
  }
  expect(store.getSnapshot()).toHaveLength(100);
  expect(store.getSnapshot()[0]).toMatchObject({ before: { value: 104 }, after: { value: 105 }, turn: 2, passage: "Hall" });
  store.clear();
  expect(store.getSnapshot()).toEqual([]);
});

it("retains a fresh watcher baseline after a gap instead of using old history", () => {
  vi.stubGlobal("SugarCube", { State: { turns: 2, passage: "Hall" } });
  const store = new PolledChanges();
  store.observe(captureChildren(root, { score: 1 }), captureChildren(root, { score: 2 }));
  store.observe(captureChildren(root, { score: 7 }), captureChildren(root, { score: 2 }));
  expect(store.getSnapshot()).toHaveLength(2);
  expect(store.getSnapshot()[0]).toMatchObject({ before: { value: 7 }, after: { value: 2 } });
  store.observe(captureChildren(root, { score: {} }), captureChildren(root, {}));
  store.observe(captureChildren(root, {}), captureChildren(root, { score: 3 }));
  expect(store.getSnapshot()[0]).toMatchObject({ kind: "added", before: { kind: "missing" } });
});

it("does not replay a favorite change when its paused tree resumes", () => {
  vi.useFakeTimers();
  vi.stubGlobal("SugarCube", { State: { turns: 1, passage: "Start" } });
  const watcher = new VariableWatcher();
  const store = new PolledChanges();
  const value = { score: 7 };
  const stops = ["variables", "favorites"].map((scope) => {
    let previous = captureChildren(root, value);
    return watcher.watch(() => captureChildren(root, value), () => true, scope, previous, (next, batch) => {
      store.observe(previous, next, batch);
      previous = next;
    }).subscribe(() => {});
  });
  try {
    watcher.setScopeActive("variables", true);
    watcher.setScopeActive("favorites", true);
    watcher.setScopeActive("variables", false);
    value.score = 8;
    watcher.refresh();
    expect(store.getSnapshot()).toHaveLength(1);
    watcher.setScopeActive("variables", true);
    expect(store.getSnapshot()).toHaveLength(1);
    store.clear();
    watcher.setScopeActive("variables", false);
    watcher.setScopeActive("variables", true);
    expect(store.getSnapshot()).toHaveLength(0);
  } finally {
    for (const stop of stops) stop();
    vi.useRealTimers();
  }
});
