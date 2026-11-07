import { afterEach, expect, it, vi } from "vitest";
import { variableLocks } from "./locks";
import { variableWatcher } from "./watcher";

afterEach(() => { variableLocks.clear(); vi.unstubAllGlobals(); });

it("updates the live value and frozen target without releasing the lock", () => {
  const variables = { score: 7 };
  vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
  variableLocks.toggle({ root: "variables", path: ["score"] });
  const lock = variableLocks.getSnapshot()[0]!;
  expect(variableLocks.update(lock.id, { kind: "property", owner: variables, key: "score" }, 7, 20)).toBeUndefined();
  expect(variables.score).toBe(20);
  expect(variableLocks.getSnapshot()[0]).toMatchObject({ id: lock.id, value: 20 });
  variables.score = 3;
  variableWatcher.refresh();
  expect(variables.score).toBe(20);
});

it("rejects stale locks and replaced owners without writing", () => {
  const player = { health: 10 };
  const variables = { player };
  vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
  variableLocks.toggle({ root: "variables", path: ["player", "health"] });
  const lock = variableLocks.getSnapshot()[0]!;
  const location = { kind: "property" as const, owner: player, key: "health" };
  variables.player = { health: 30 };
  expect(variableLocks.update(lock.id, location, 10, 20)).toContain("changed");
  expect(player.health).toBe(10);
  expect(variables.player.health).toBe(30);
  variableLocks.unlock(lock.id);
  expect(variableLocks.update(lock.id, location, 10, 20)).toContain("changed");
});

it("rejects a stale target value and a property that became read-only", () => {
  const variables = { score: 7 };
  vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
  variableLocks.toggle({ root: "variables", path: ["score"] });
  const lock = variableLocks.getSnapshot()[0]!;
  const location = { kind: "property" as const, owner: variables, key: "score" };
  expect(variableLocks.update(lock.id, location, 7, 20)).toBeUndefined();
  expect(variableLocks.update(lock.id, location, 7, 30)).toContain("changed");
  Reflect.set(variables, "score", "changed type");
  expect(variableLocks.update(lock.id, location, 20, 30)).toContain("editable");
  Reflect.set(variables, "score", 20);
  Object.defineProperty(variables, "score", { writable: false });
  expect(variableLocks.update(lock.id, location, 20, 30)).toContain("editable");
  expect(variables.score).toBe(20);
  expect(variableLocks.getSnapshot()[0]?.value).toBe(20);
});

it("does not update through a later lock when two paths converge", () => {
  const variables = { player: { health: 10 }, leader: { health: 20 } };
  vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
  variableLocks.toggle({ root: "variables", path: ["player", "health"] });
  variableLocks.toggle({ root: "variables", path: ["leader", "health"] });
  const second = variableLocks.getSnapshot()[1]!;
  variables.leader = variables.player;
  expect(variableLocks.update(second.id, { kind: "property", owner: variables.player, key: "health" }, 20, 30))
    .toContain("Another lock");
  expect(variables.player.health).toBe(10);
});
