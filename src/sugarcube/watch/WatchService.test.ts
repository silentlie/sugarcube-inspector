import { describe, expect, it } from "vitest";
import { WatchService } from "./WatchService";
import { SugarCubeService } from "../SugarCubeService";
import type { SugarCubeObject } from "twine-sugarcube";
import { applyVariablePatches } from "../variables/applyVariablePatches";
import type { WatchRequest, VariablePath, PathSegment } from "./types";
import { minimizeWatchPaths } from "./watchPaths";
import { resolvePath } from "../variables/path";
import type { SugarCubeSnapshot } from "../types";

const player: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "player" }];
const health: VariablePath = [...player, { type: "property", key: "health" }];
function baseline(story: Record<string, unknown>): SugarCubeSnapshot {
  return {
    story: { name: "Test", ifId: "test" },
    passage: { name: "Start", tags: [] },
    history: { turns: 1, length: 1 },
    variables: { story, temporary: {} },
    capturedAt: 0,
  };
}
function setup(story: Record<string, unknown>) {
  const runtime = { State: { variables: story, temporary: {} } };
  const service = new WatchService(new SugarCubeService(runtime as unknown as SugarCubeObject));
  const snapshot = structuredClone(baseline(story));
  const generation = service.capture(snapshot);
  // Inspector and MAIN each hold an independent synchronized graph.
  return { service, generation, snapshot: structuredClone(snapshot), runtime };
}
function request(generation: number, targets: VariablePath[] = [player]): WatchRequest {
  return { generation, favorites: targets, visible: [] };
}

describe("synchronized snapshot watch service", () => {
  it("skips unchanged paths and replaces only an entire changed watched value", () => {
    const stores = { story: { player: { health: 100, stats: { strength: 10 } }, inventory: [1, 2] }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    expect(service.poll(request(generation)).changes).toEqual([]);

    stores.story.player.health = 75;
    const response = service.poll(request(generation));
    expect(response.changes).toEqual([{
      op: "set", path: player,
      value: { health: 75, stats: { strength: 10 } },
    }]);
    expect((snapshot.variables.story as Record<string, unknown>).player).toEqual({ health: 100, stats: { strength: 10 } });

    // The synchronized state must retain a clone, not a mutable live object.
    const updated = applyVariablePatches(snapshot.variables, response.changes);
    expect(((updated.story as Record<string, unknown>).player as { health: number }).health).toBe(75);
    expect(service.poll(request(generation)).changes).toEqual([]);
    stores.story.player.stats.strength = 12;
    expect(service.poll(request(generation)).changes).toEqual([{
      op: "set", path: player,
      value: { health: 75, stats: { strength: 12 } },
    }]);
  });

  it("preserves path independence when snapshot paths alias the same object", () => {
    const shared = { health: 100 };
    const stores = { story: { player: shared, character: shared }, temporary: {} };
    const { service, generation } = setup(stores.story);
    shared.health = 75;
    const other: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "character" }, { type: "property", key: "health" }];
    const response = service.poll(request(generation, [health, other]));
    expect(response.changes).toHaveLength(2);
    expect(response.changes.map((change) => change.op === "set" ? change.value : null)).toEqual([75, 75]);
    expect(service.poll(request(generation, [health, other])).changes).toEqual([]);
  });

  it("distinguishes undefined from missing and keeps absent paths registered", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: undefined } },
      temporary: {},
    };
    const { service, generation } = setup(stores.story);
    const absent = service.poll(request(generation, [health]));
    expect(absent.changes).toEqual([]);

    delete (stores.story.player as Record<string, unknown>).health;
    const missing = service.poll(request(generation, [health]));
    expect(missing.changes).toEqual([{ op: "delete", path: health }]);
    expect(service.poll(request(generation, [health])).changes).toEqual([]);

    (stores.story.player as Record<string, unknown>).health = undefined;
    expect(service.poll(request(generation, [health])).changes).toEqual([
      { op: "set", path: health, value: undefined },
    ]);
  });

  it("deletes missing ancestors and restores their whole subtree when re-created", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: 100, mana: 25 } },
      temporary: {},
    };
    const { service, generation, snapshot } = setup(stores.story);
    delete stores.story.player;
    const deleted = service.poll(request(generation, [health]));
    expect(deleted.changes).toEqual([{ op: "delete", path: player }]);

    const removed = applyVariablePatches(snapshot.variables, deleted.changes);
    expect(Object.hasOwn(removed.story, "player")).toBe(false);

    stores.story.player = { health: 75, mana: 50 };
    const restored = service.poll(request(generation, [health]));
    expect(restored.changes).toEqual([{
      op: "set", path: player, value: { health: 75, mana: 50 },
    }]);
    expect((applyVariablePatches(removed, restored.changes).story as Record<string, unknown>).player).toEqual(stores.story.player);
  });

  it("replaces a parent that becomes null, undefined, or a primitive", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: 100, mana: 25 } }, temporary: {},
    };
    const { service, generation, snapshot } = setup(stores.story);
    stores.story.player = null;
    const nullValue = service.poll(request(generation, [health]));
    expect(nullValue.changes).toEqual([{ op: "set", path: player, value: null }]);
    let displayed = applyVariablePatches(snapshot.variables, nullValue.changes);
    expect((displayed.story as Record<string, unknown>).player).toBeNull();

    stores.story.player = 123;
    const primitive = service.poll(request(generation, [health]));
    expect(primitive.changes).toEqual([{ op: "set", path: player, value: 123 }]);
    displayed = applyVariablePatches(displayed, primitive.changes);

    stores.story.player = {};
    const emptyParent = service.poll(request(generation, [health]));
    expect(emptyParent.changes).toEqual([{ op: "set", path: player, value: {} }]);
    displayed = applyVariablePatches(displayed, emptyParent.changes);
    expect((displayed.story as Record<string, unknown>).player).toEqual({});

    stores.story.player = { health: 99, mana: 40 };
    const restored = service.poll(request(generation, [health]));
    expect(restored.changes).toEqual([{
      op: "set", path: health, value: 99,
    }]);
  });

  it("notices when the earliest missing ancestor changes", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: {} }, temporary: {},
    };
    const { service, generation } = setup(stores.story);
    expect(service.poll(request(generation, [health])).changes).toEqual([]);
    delete stores.story.player;
    expect(service.poll(request(generation, [health])).changes).toEqual([
      { op: "delete", path: player },
    ]);
  });

  it("replaces synchronized state with each new full snapshot and ignores stale generations", () => {
    const stores = { story: { player: { health: 100 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    stores.story.player.health = 20;
    expect(service.poll(request(generation)).changes).toHaveLength(1);
    const next = service.capture(structuredClone(baseline(stores.story)));
    expect(next).not.toBe(generation);
    expect(service.poll(request(generation)).generation).toBe(next);
    expect(service.poll(request(next)).changes).toEqual([]);
  });

  it("reads the current variable store after SugarCube replaces it", () => {
    const { service, generation, runtime } = setup({ player: { health: 100 } });
    runtime.State.variables = { player: { health: 75 } };
    expect(service.poll(request(generation, [health])).changes).toEqual([
      { op: "set", path: health, value: 75 },
    ]);
  });

  it("handles circular watched objects without throwing on repeated comparisons", () => {
    const playerData: Record<string, unknown> = { health: 100 };
    playerData.self = playerData;
    const stores = { story: { player: playerData }, temporary: {} };
    const { service, generation } = setup(stores.story);
    expect(service.poll(request(generation)).changes).toEqual([]);
    playerData.health = 85;
    expect(service.poll(request(generation)).changes).toHaveLength(1);
    expect(service.poll(request(generation)).changes).toEqual([]);
  });

  it("keeps paths in different scopes independent when minimizing watches", () => {
    const storyRoot: VariablePath = [{ type: "property", key: "story" }];
    const temporaryScore: VariablePath = [{ type: "property", key: "temporary" }, { type: "property", key: "score" }];
    expect(minimizeWatchPaths([player, storyRoot, temporaryScore])).toEqual([
      storyRoot, temporaryScore,
    ]);
    expect(resolvePath({ story: {}, temporary: { score: 5 } }, temporaryScore).status).toBe("found");
    expect(resolvePath({ story: { score: 5 }, temporary: {} }, temporaryScore).status).toBe("missing");
  });

  it("keeps distinct Map/Set entry paths and only prunes actual descendants", () => {
    const targets: VariablePath[] = [
      [{ type: "property", key: "story" }, { type: "property", key: "items" }, { type: "mapValue", index: 1 }],
      [{ type: "property", key: "story" }, { type: "property", key: "items" }, { type: "mapKey", index: 0 }],
      [{ type: "property", key: "story" }, { type: "property", key: "flags" }, { type: "setValue", index: 0 }],
    ];
    expect(minimizeWatchPaths([...targets, targets[0]!])).toEqual(targets);
    expect(minimizeWatchPaths([player, health])).toEqual([player]);
    expect(minimizeWatchPaths([targets[0]!, targets[0]!.slice(0, 2) as VariablePath]))
      .toEqual([targets[0]!.slice(0, 2)]);
  });

  it("patches only changed nested Map values and Set members when entry positions stay stable", () => {
    const member = { hp: 10 };
    const stores = { story: {
      map: new Map([["mc", { hp: 10 }]]),
      set: new Set([member]),
    }, temporary: {} };
    const mapPath: VariablePath = [
      { type: "property", key: "story" }, { type: "property", key: "map" },
    ];
    const setPath: VariablePath = [
      { type: "property", key: "story" }, { type: "property", key: "set" },
    ];
    const mapHp: VariablePath = [...mapPath, { type: "mapValue", index: 0 }, { type: "property", key: "hp" }];
    const setHp: VariablePath = [...setPath, { type: "setValue", index: 0 }, { type: "property", key: "hp" }];
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(request(generation, [mapHp, setHp])).changes;

    expect(poll()).toEqual([]); // Establish live identities, not cloned snapshot references.
    stores.story.map.get("mc")!.hp = 20;
    member.hp = 30;
    const changes = poll();
    expect(changes).toEqual([
      { op: "set", path: mapHp, value: 20 },
      { op: "set", path: setHp, value: 30 },
    ]);
    applyVariablePatches(snapshot.variables, changes);
    const copied = snapshot.variables.story as typeof stores.story;
    expect(copied.map.get("mc")!.hp).toBe(20);
    expect([...copied.set][0]!.hp).toBe(30);
    expect(poll()).toEqual([]);
  });

  it("patches nested Map keys when the key's object identity is unchanged", () => {
    const key = { hp: 10 };
    const stores = { story: { map: new Map([[key, "hero"]]) }, temporary: {} };
    const map: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "map" }];
    const keyHp: VariablePath = [...map, { type: "mapKey", index: 0 }, { type: "property", key: "hp" }];
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(request(generation, [keyHp])).changes;

    expect(poll()).toEqual([]);
    key.hp = 15;
    const patches = poll();
    expect(patches).toEqual([{ op: "set", path: keyHp, value: 15 }]);
    applyVariablePatches(snapshot.variables, patches);
    const copied = (snapshot.variables.story as typeof stores.story).map;
    expect([...copied.keys()][0]!.hp).toBe(15);
  });

  it("replaces a collection when an entry shifts and then resumes precise patches", () => {
    const first = { hp: 1 }, second = { hp: 2 }, third = { hp: 3 };
    const stores = { story: {
      map: new Map([["a", first], ["b", second], ["c", third]]),
      set: new Set([first, second, third]),
    }, temporary: {} };
    const map: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "map" }];
    const set: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "set" }];
    const mapHp: VariablePath = [...map, { type: "mapValue", index: 1 }, { type: "property", key: "hp" }];
    const setHp: VariablePath = [...set, { type: "setValue", index: 1 }, { type: "property", key: "hp" }];
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(request(generation, [mapHp, setHp])).changes;

    expect(poll()).toEqual([]);
    stores.story.map.delete("a");
    stores.story.set.delete(first);
    const replaced = poll();
    expect(replaced).toEqual([
      { op: "set", path: map, value: new Map([["b", { hp: 2 }], ["c", { hp: 3 }]]) },
      { op: "set", path: set, value: new Set([{ hp: 2 }, { hp: 3 }]) },
    ]);
    applyVariablePatches(snapshot.variables, replaced);
    const copied = snapshot.variables.story as typeof stores.story;
    expect([...copied.map.keys()]).toEqual(["b", "c"]);
    expect([...copied.set].map((entry) => entry.hp)).toEqual([2, 3]);

    third.hp = 30;
    const changes = poll();
    expect(changes).toEqual([
      { op: "set", path: mapHp, value: 30 },
      { op: "set", path: setHp, value: 30 },
    ]);
    applyVariablePatches(snapshot.variables, changes);
    expect(copied.map.get("c")!.hp).toBe(30);
    expect([...copied.set][1]!.hp).toBe(30);
  });

  it("detects a changed Set member on the first poll from the cloned snapshot", () => {
    const stores = { story: { set: new Set([{ hp: 1 }]) }, temporary: {} };
    const set: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "set" }];
    const hp: VariablePath = [...set, { type: "setValue", index: 0 }, { type: "property", key: "hp" }];
    const { service, generation, snapshot } = setup(stores.story);
    [...stores.story.set][0]!.hp = 2;
    const patches = service.poll(request(generation, [hp])).changes;
    expect(patches).toEqual([{ op: "set", path: set, value: new Set([{ hp: 2 }]) }]);
    applyVariablePatches(snapshot.variables, patches);
    expect([...((snapshot.variables.story as typeof stores.story).set)][0]!.hp).toBe(2);
  });

  it("detects collection shifts with visible-only or missing favorite entry paths", () => {
    const first = { hp: 1 }, second = { hp: 2 };
    const stores = { story: { set: new Set([first, second]) }, temporary: {} };
    const set: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "set" }];
    const visibleHp: VariablePath = [...set, { type: "setValue", index: 0 }, { type: "property", key: "hp" }];
    const absent: VariablePath = [...set, { type: "setValue", index: 7 }, { type: "property", key: "hp" }];
    const { service, generation } = setup(stores.story);
    const req: WatchRequest = { generation, favorites: [absent], visible: [visibleHp] };
    const poll = () => service.poll(req).changes;

    expect(poll()).toEqual([]);
    stores.story.set.delete(first);
    expect(poll()).toEqual([{ op: "set", path: set, value: new Set([{ hp: 2 }]) }]);
    second.hp = 25;
    expect(poll()).toEqual([{ op: "set", path: visibleHp, value: 25 }]);
  });

  it("retains synchronized changes across watch removal and a different path reactivation", () => {
    const stores = { story: { player: { health: 10 } }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    let displayed = snapshot.variables;

    stores.story.player.health = 20;
    const changed = service.poll(request(generation, [player])).changes;
    expect(changed).toEqual([{
      op: "set", path: player, value: { health: 20 },
    }]);
    displayed = applyVariablePatches(displayed, changed);

    // No active watches, and a value returns to its original snapshot value.
    expect(service.poll(request(generation, [])).changes).toEqual([]);
    stores.story.player.health = 10;

    // The newly watched descendant must compare with the already synchronized
    // hp=20, not the full snapshot's hp=10.
    const restored = service.poll(request(generation, [health])).changes;
    expect(restored).toEqual([{
      op: "set", path: health, value: 10,
    }]);
    displayed = applyVariablePatches(displayed, restored);
    expect((displayed.story as { player: { health: number } }).player.health).toBe(10);
    expect(service.poll(request(generation, [health])).changes).toEqual([]);
  });

  it("keeps synchronized parent structure across periods without visible watches", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 10 } }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const visibleHealth: WatchRequest = {
      generation, favorites: [], visible: [health],
    };
    const idle = { generation, favorites: [], visible: [] };
    const poll = () => service.poll(visibleHealth).changes;
    expect(poll()).toEqual([]);

    (stores.story.player as Record<string, unknown>).mana = 5;
    const added = poll();
    expect(added).toEqual([{
      op: "set", path: [...player, { type: "property", key: "mana" }],
      value: 5,
    }]);
    let displayed = applyVariablePatches(snapshot.variables, added);
    expect(service.poll(idle).changes).toEqual([]);

    delete (stores.story.player as Record<string, unknown>).mana;
    const removed = poll();
    expect(removed).toEqual([{
      op: "delete", path: [...player, { type: "property", key: "mana" }],
    }]);
    displayed = applyVariablePatches(displayed, removed);
    expect((displayed.story as { player: unknown }).player).toEqual({ health: 10 });
  });

  it("keeps aliased paths independently stale until each one is polled", () => {
    const shared = { health: 10 };
    const stores = { story: { left: shared, right: shared }, temporary: {} };
    const left: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "left" }];
    const right: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "right" }];
    const { service, generation, snapshot } = setup(stores.story);
    shared.health = 20;
    const first = service.poll(request(generation, [left])).changes;
    expect(first).toEqual([{ op: "set", path: left, value: { health: 20 } }]);
    const displayed = applyVariablePatches(snapshot.variables, first);
    const copied = displayed.story as { left: { health: number }; right: { health: number } };
    expect(copied.left.health).toBe(20);
    expect(copied.right.health).toBe(10);
    expect(copied.left).not.toBe(copied.right);

    const second = service.poll(request(generation, [right])).changes;
    expect(second).toEqual([{ op: "set", path: right, value: { health: 20 } }]);
    applyVariablePatches(displayed, second);
    expect(copied.right.health).toBe(20);
    expect(service.poll(request(generation, [right])).changes).toEqual([]);
  });

  it("does not mutate another alias when a watched path is reassigned", () => {
    const shared = { health: 10 };
    const stores = { story: { left: shared, right: shared }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const left: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "left" }];
    stores.story.left = { health: 90 };
    const changed = service.poll(request(generation, [left])).changes;
    expect(changed).toEqual([{ op: "set", path: left, value: { health: 90 } }]);
    const displayed = applyVariablePatches(snapshot.variables, changed);
    const copied = displayed.story as { left: { health: number }; right: { health: number } };
    expect(copied.left.health).toBe(90);
    expect(copied.right.health).toBe(10);
    expect(copied.left).not.toBe(copied.right);
  });

  it("does not advance any watch baseline when cloning a changed path fails", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { a: 1, b: 2 }, temporary: {},
    };
    const { service, generation } = setup(stores.story);
    stores.story.a = 3;
    stores.story.b = () => undefined;
    const targets: VariablePath[] = ["a", "b"].map((key): VariablePath => ([{ type: "property", key: "story" }, { type: "property", key }]));
    expect(() => service.poll(request(generation, targets))).toThrow();
    stores.story.b = 4;
    expect(service.poll(request(generation, targets)).changes).toEqual([
      { op: "set", path: targets[0]!, value: 3 },
      { op: "set", path: targets[1]!, value: 4 },
    ]);
  });
});

describe("visible structural watch", () => {
  const root: VariablePath = [{ type: "property", key: "story" }];
  function visible(generation: number, entries: VariablePath[]): WatchRequest {
    return { generation, favorites: [], visible: entries };
  }

  it("derives root structure from a visible top-level child", () => {
    const score: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "score" }];
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { score: 7 }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [score])).changes;

    expect(poll()).toEqual([]);
    stores.story.newVariable = 15;
    expect(poll()).toEqual([{
      op: "set", path: [{ type: "property", key: "story" }, { type: "property", key: "newVariable" }],
      value: 15,
    }]);
    delete stores.story.newVariable;
    expect(poll()).toEqual([{
      op: "delete", path: [{ type: "property", key: "story" }, { type: "property", key: "newVariable" }],
    }]);
    // Without any visible rows or an explicit empty-root registration,
    // the service does not keep polling the nonempty root.
    expect(service.poll(visible(generation, [])).changes).toEqual([]);
  });

  it("checks a nonempty root without any visible child rows, but does not deep-watch collapsed values", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 100 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root])).changes;

    expect(poll()).toEqual([]);
    (stores.story.player as Record<string, unknown>).health = 75;
    expect(poll()).toEqual([]);

    stores.story.newQuest = true;
    expect(poll()).toEqual([{
      op: "set", path: [{ type: "property", key: "story" }, { type: "property", key: "newQuest" }],
      value: true,
    }]);
    delete stores.story.player;
    expect(poll()).toEqual([{
      op: "delete", path: player,
    }]);
  });

  it("deduplicates explicit root structure and structure inferred from a visible child", () => {
    const score: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "score" }];
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { score: 7 }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root, score])).changes;

    expect(poll()).toEqual([]);
    stores.story.newQuest = 1;
    expect(poll()).toEqual([{
      op: "set", path: [{ type: "property", key: "story" }, { type: "property", key: "newQuest" }],
      value: 1,
    }]);
    expect(poll()).toEqual([]);
  });

  it("tracks an empty root, additions, removals and restoration without missing watches", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: {}, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root])).changes;
    expect(poll()).toEqual([]);
    stores.story.score = 7;
    const added = poll();
    expect(added).toEqual([{
      op: "set", path: [{ type: "property", key: "story" }, { type: "property", key: "score" }], value: 7,
    }]);
    let displayed = applyVariablePatches(snapshot.variables, added);
    expect(displayed.story).toEqual({ score: 7 });
    delete stores.story.score;
    const removed = poll();
    expect(removed).toEqual([{ op: "delete", path: [{ type: "property", key: "story" }, { type: "property", key: "score" }] }]);
    displayed = applyVariablePatches(displayed, removed);
    expect(displayed.story).toEqual({});
    stores.story.score = 9;
    displayed = applyVariablePatches(displayed, poll());
    expect(displayed.story).toEqual({ score: 9 });
    expect(poll()).toEqual([]);
  });

  it("observes empty expanded containers and their parent structure", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: {} }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [player])).changes;
    expect(poll()).toEqual([]);
    (stores.story.player as Record<string, unknown>).hp = 100;
    expect(poll()).toEqual([{
      op: "set", path: player, value: { hp: 100 },
    }]);
    delete (stores.story.player as Record<string, unknown>).hp;
    expect(poll()).toEqual([{
      op: "set", path: player, value: {},
    }]);
    (stores.story.player as Record<string, unknown>).mp = 50;
    expect(poll()).toEqual([{
      op: "set", path: player, value: { mp: 50 },
    }]);
  });

  it("detects new siblings through the visible leaf's parent without cloning unchanged siblings", () => {
    const stores = { story: { player: { health: 100 } as Record<string, unknown> }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [health])).changes;
    expect(poll()).toEqual([]);
    stores.story.player.mana = { max: 50 };
    expect(poll()).toEqual([{
      op: "set", path: [...player, { type: "property", key: "mana" }],
      value: { max: 50 },
    }]);
    stores.story.player.health = 75;
    expect(poll()).toEqual([{
      op: "set", path: health, value: 75,
    }]);
  });

  it("keeps scalar watches after replacing a visible object with a primitive", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { hp: 10 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [player])).changes;
    expect(poll()).toEqual([]);
    stores.story.player = 10;
    expect(poll()).toEqual([{ op: "set", path: player, value: 10 }]);
    stores.story.player = 20;
    expect(poll()).toEqual([{ op: "set", path: player, value: 20 }]);
    expect(poll()).toEqual([]);
  });

  it("updates array lengths and new indices when visible, including empty arrays", () => {
    const stores = { story: { items: [] as number[] }, temporary: {} };
    const item: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "items" }];
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [item])).changes;
    expect(poll()).toEqual([]);
    stores.story.items.push(4);
    const added = poll();
    expect(added).toEqual([{
      op: "set", path: item, value: [4],
    }]);
    let displayed = applyVariablePatches(snapshot.variables, added);
    expect((displayed.story as Record<string, unknown>).items).toEqual([4]);
    stores.story.items.pop();
    displayed = applyVariablePatches(displayed, poll());
    expect((displayed.story as Record<string, unknown>).items).toEqual([]);
  });

  it("restores a missing array ancestor as an array rather than an object", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { items: [{ hp: 10 }] }, temporary: {},
    };
    const items: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "items" }];
    const hp: VariablePath = [...items, { type: "property", key: "0" }, { type: "property", key: "hp" }];
    const { service, generation, snapshot } = setup(stores.story);

    delete stores.story.items;
    const removed = service.poll(request(generation, [hp])).changes;
    expect(removed).toEqual([{ op: "delete", path: items }]);
    applyVariablePatches(snapshot.variables, removed);

    stores.story.items = [{ hp: 20 }];
    const restored = service.poll(request(generation, [hp])).changes;
    expect(restored).toEqual([{ op: "set", path: items, value: [{ hp: 20 }] }]);
    applyVariablePatches(snapshot.variables, restored);
    const result = (snapshot.variables.story as Record<string, unknown>).items;
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ hp: 20 }]);
  });

  it("replaces a Map when keys are inserted rather than tracking unstable indices", () => {
    const stores = { story: { items: new Map<string, number>() }, temporary: {} };
    const item: VariablePath = [{ type: "property", key: "story" }, { type: "property", key: "items" }];
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [item])).changes;
    expect(poll()).toEqual([]);
    stores.story.items.set("key", 1);
    expect(poll()).toEqual([{
      op: "set", path: item, value: new Map([["key", 1]]),
    }]);
  });

  it("does not poll unregistered containers, but observes them when registered", () => {
    const stores = { story: { player: { hp: 10 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = (expanded: boolean) =>
      service.poll(visible(generation, expanded ? [root, player] : [root])).changes;

    expect(poll(false)).toEqual([]);
    stores.story.player.hp = 20;
    expect(poll(false)).toEqual([]);
    // The first expanded poll compares the whole object to its baseline.
    expect(poll(true)).toEqual([
      { op: "set", path: player, value: { hp: 20 } },
    ]);
    expect(poll(true)).toEqual([]);
    stores.story.player.hp = 30;
    expect(poll(true)).toEqual([
      { op: "set", path: player, value: { hp: 30 } },
    ]);
    expect(poll(false)).toEqual([]);
  });

  it("does not clone an unchanged value subtree just to inspect structure", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 7 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root])).changes;
    expect(poll()).toEqual([]);
    // Existing child value becomes non-cloneable, but only root structure is watched.
    (stores.story.player as Record<string, unknown>).health = () => {};
    expect(poll()).toEqual([]);
  });
});

describe("path existence", () => {
  it("distinguishes missing values from explicitly undefined values", () => {
    const stores = { story: { player: { health: undefined } }, temporary: {} };
    expect(resolvePath(stores, health).status).toBe("found");
    delete (stores.story.player as Record<string, unknown>).health;
    expect(resolvePath(stores, health).status).toBe("missing");
    stores.story.player.health = undefined;
    expect(resolvePath(stores, health).status).toBe("found");
    (stores.story as Record<string, unknown>).player = null;
    expect(resolvePath(stores, health).status).toBe("blocked");
  });

  it("handles typed paths through array and Map/Set entries", () => {
    const stores = { story: {
      items: new Map([["a", 1]]),
      flags: new Set(["seen"]),
      list: [undefined],
    }, temporary: {} };
    const key = (segments: PathSegment[]): VariablePath => ([{ type: "property", key: "story" }, ...segments]);
    expect(resolvePath(stores, key([{ type: "property", key: "items" }, { type: "mapValue", index: 0 }])).status).toBe("found");
    expect(resolvePath(stores, key([{ type: "property", key: "items" }, { type: "mapKey", index: 1 }])).status).toBe("missing");
    expect(resolvePath(stores, key([{ type: "property", key: "flags" }, { type: "setValue", index: 0 }])).status).toBe("found");
    expect(resolvePath(stores, key([{ type: "property", key: "list" }, { type: "property", key: "0" }])).status).toBe("found");
    expect(resolvePath(stores, key([{ type: "property", key: "list" }, { type: "property", key: "1" }])).status).toBe("missing");
  });
});
