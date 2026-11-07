import { afterEach, expect, it, vi } from "vitest";
import { captureVariableBaseline, compareVariables } from "./comparison";

afterEach(() => vi.unstubAllGlobals());

it("compares session-only symbol favorites by key identity", () => {
  const first = Symbol("health");
  const second = Symbol("health");
  const player = { [first]: 10, [second]: 30 };
  vi.stubGlobal("SugarCube", { State: { variables: { player }, temporary: {} } });
  const baseline = captureVariableBaseline([first, second].map((key) => ({ root: "variables", path: ["player", key] })));
  player[first] = 20;
  const changes = compareVariables(baseline);
  expect(changes).toHaveLength(1);
  expect(changes[0]?.path.path).toEqual(["player", first]);
  expect(changes[0]).toMatchObject({ before: { value: 10 }, after: { value: 20 } });
});

it("compares primitives in both roots and captured favorite paths without invoking getters", () => {
  const getter = vi.fn(() => 100);
  const variables: Record<string, unknown> = { score: 7, removed: true, player: { health: 10 }, __sugarcubeInspector: { version: 1 } };
  Object.defineProperty(variables, "getter", { get: getter });
  const temporary = { choice: "north" };
  vi.stubGlobal("SugarCube", { State: { variables, temporary } });
  const baseline = captureVariableBaseline([{ root: "variables", path: ["player", "health"] }]);
  variables.score = "7";
  delete variables.removed;
  variables.player = { health: 20 };
  variables.added = false;
  temporary.choice = "south";
  const changes = compareVariables(baseline);
  expect(changes.map(({ path, kind }) => [path.root, path.path.join("."), kind])).toEqual([
    ["variables", "score", "changed"], ["variables", "removed", "removed"],
    ["temporary", "choice", "changed"], ["variables", "player.health", "changed"],
    ["variables", "added", "added"],
  ]);
  expect(changes[0]).toMatchObject({ before: { kind: "value", value: 7 }, after: { kind: "value", value: "7" } });
  expect(getter).not.toHaveBeenCalled();
});

it("distinguishes a primitive becoming complex from deletion and retains full string values", () => {
  const variables: Record<string, unknown> = { text: "x".repeat(200), value: 2, zero: -0 };
  vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
  const baseline = captureVariableBaseline([]);
  variables.text = "x".repeat(200) + "changed";
  variables.value = {};
  variables.zero = 0;
  const changes = compareVariables(baseline);
  expect(changes).toHaveLength(3);
  expect(changes[0]?.before).toEqual({ kind: "value", value: "x".repeat(200) });
  expect(changes[1]).toMatchObject({ kind: "changed", after: { kind: "other" } });
});
