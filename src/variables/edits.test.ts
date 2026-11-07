import { afterEach, expect, it, vi } from "vitest";
import { variableEdits } from "./edits";
import { variableLocks } from "./locks";
import { variableWatcher } from "./watcher";

afterEach(() => { variableEdits.clear(); variableLocks.clear(); vi.unstubAllGlobals(); });

function setup() {
  const variables = { score: 7 };
  const state = { variables, temporary: {}, active: {} };
  vi.stubGlobal("SugarCube", { State: state });
  const path = { root: "variables" as const, path: ["score"] };
  const location = { kind: "property" as const, owner: variables, key: "score" };
  return { variables, state, path, location };
}

it("moves backward and forward through edits and discards redo on a new edit", () => {
  const { variables, path, location } = setup();
  expect(variableEdits.save(path, location, 7, 10)).toBeUndefined();
  expect(variableEdits.save(path, location, 10, 20)).toBeUndefined();
  expect(variableEdits.undo()).toBeUndefined();
  expect(variables.score).toBe(10);
  expect(variableEdits.undo()).toBeUndefined();
  expect(variables.score).toBe(7);
  expect(variableEdits.redo()).toBeUndefined();
  expect(variables.score).toBe(10);
  expect(variableEdits.save(path, location, 10, 10)).toBeUndefined();
  expect(variableEdits.getSnapshot().redo).toHaveLength(1);
  expect(variableEdits.save(path, location, 10, 25)).toBeUndefined();
  expect(variableEdits.getSnapshot().redo).toHaveLength(0);
  expect(variableEdits.undo()).toBeUndefined();
  expect(variables.score).toBe(10);
});

it("keeps only the most recent twenty successful edits", () => {
  const { variables, path, location } = setup();
  for (let index = 1; index <= 25; index++) {
    expect(variableEdits.save(path, location, variables.score, index + 7)).toBeUndefined();
  }
  expect(variableEdits.getSnapshot().undo).toHaveLength(20);
  for (let index = 0; index < 20; index++) expect(variableEdits.undo()).toBeUndefined();
  expect(variables.score).toBe(12);
  expect(variableEdits.getSnapshot().undo).toHaveLength(0);
  expect(variableEdits.getSnapshot().redo).toHaveLength(20);
});

it("preserves conflict, owner, writable and lock guards for undo and redo", () => {
  const { variables, state, path, location } = setup();
  variableEdits.save(path, location, 7, 10);
  variables.score = 20;
  expect(variableEdits.undo()).toContain("Value changed");
  expect(variables.score).toBe(20);
  variables.score = 10;
  variableLocks.toggle(path);
  expect(variableEdits.undo()).toContain("Unlock");
  variableLocks.clear();
  Object.defineProperty(variables, "score", { writable: false });
  expect(variableEdits.undo()).toContain("Value changed");
  Object.defineProperty(variables, "score", { writable: true });
  expect(variableEdits.undo()).toBeUndefined();
  state.variables = { score: 7 };
  expect(variableEdits.redo()).toContain("Value changed");
  expect(state.variables.score).toBe(7);
});

it("clears both directions when the active story moment changes", () => {
  const { state, path, location } = setup();
  variableEdits.save(path, location, 7, 10);
  variableEdits.undo();
  state.active = {};
  variableWatcher.refresh();
  expect(variableEdits.getSnapshot()).toEqual({ undo: [], redo: [] });
});

it("does not redo over a later game write or record a failed save", () => {
  const { variables, path, location } = setup();
  expect(variableEdits.save(path, location, 8, 10)).toContain("Value changed");
  expect(variableEdits.getSnapshot().undo).toHaveLength(0);
  variableEdits.save(path, location, 7, 10);
  variableEdits.undo();
  variables.score = 9;
  expect(variableEdits.redo()).toContain("Value changed");
  expect(variables.score).toBe(9);
  expect(variableEdits.getSnapshot().redo).toHaveLength(1);
});
