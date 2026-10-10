import { describe, expect, it } from "vitest";
import { WatchService } from "./watchService";
import { applyWatchPatches } from "./applyWatchPatches";
import { minimizeWatchTargets, watchPathExists, type WatchRequest, type WatchTarget } from "./watch";
import type { SugarCubeSnapshot } from "./types";

const player: WatchTarget = {
  scope: "story", path: [{ type: "property", key: "player" }],
};
const health: WatchTarget = {
  scope: "story", path: [...player.path, { type: "property", key: "health" }],
};
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
  const service = new WatchService();
  const snapshot = structuredClone(baseline(story));
  const generation = service.capture(snapshot);
  // Inspector and MAIN each hold an independent synchronized graph.
  return { service, generation, snapshot: structuredClone(snapshot) };
}
function request(generation: number, targets: WatchTarget[] = [player]): WatchRequest {
  return { generation, favorites: targets, visible: [] };
}

describe("synchronized snapshot watch service", () => {
  it("skips unchanged paths and replaces only an entire changed watched value", () => {
    const stores = { story: { player: { health: 100, stats: { strength: 10 } }, inventory: [1, 2] }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    expect(service.poll(request(generation), stores).changes).toEqual([]);

    stores.story.player.health = 75;
    const response = service.poll(request(generation), stores);
    expect(response.changes).toEqual([{
      op: "set", scope: "story", path: player.path,
      value: { health: 75, stats: { strength: 10 } },
    }]);
    expect(response.mainDurationMs).toBeGreaterThanOrEqual(0);
    expect((snapshot.variables.story as Record<string, unknown>).player).toEqual({ health: 100, stats: { strength: 10 } });

    // The synchronized state must retain a clone, not a mutable live object.
    const updated = applyWatchPatches(snapshot.variables, response.changes);
    expect(((updated.story as Record<string, unknown>).player as { health: number }).health).toBe(75);
    expect(service.poll(request(generation), stores).changes).toEqual([]);
    stores.story.player.stats.strength = 12;
    expect(service.poll(request(generation), stores).changes).toEqual([{
      op: "set", scope: "story", path: player.path,
      value: { health: 75, stats: { strength: 12 } },
    }]);
  });

  it("preserves path independence when snapshot paths alias the same object", () => {
    const shared = { health: 100 };
    const stores = { story: { player: shared, character: shared }, temporary: {} };
    const { service, generation } = setup(stores.story);
    shared.health = 75;
    const other: WatchTarget = { scope: "story", path: [{ type: "property", key: "character" }, { type: "property", key: "health" }] };
    const response = service.poll(request(generation, [health, other]), stores);
    expect(response.changes).toHaveLength(2);
    expect(response.changes.map((change) => change.op === "set" ? change.value : null)).toEqual([75, 75]);
    expect(service.poll(request(generation, [health, other]), stores).changes).toEqual([]);
  });

  it("distinguishes undefined from missing and keeps absent paths registered", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: undefined } },
      temporary: {},
    };
    const { service, generation } = setup(stores.story);
    const absent = service.poll(request(generation, [health]), stores);
    expect(absent.changes).toEqual([]);

    delete (stores.story.player as Record<string, unknown>).health;
    const missing = service.poll(request(generation, [health]), stores);
    expect(missing.changes).toEqual([{ op: "delete", scope: "story", path: health.path }]);
    expect(service.poll(request(generation, [health]), stores).changes).toEqual([]);

    (stores.story.player as Record<string, unknown>).health = undefined;
    expect(service.poll(request(generation, [health]), stores).changes).toEqual([
      { op: "set", scope: "story", path: health.path, value: undefined },
    ]);
  });

  it("deletes missing ancestors and restores their whole subtree when re-created", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: 100, mana: 25 } },
      temporary: {},
    };
    const { service, generation, snapshot } = setup(stores.story);
    delete stores.story.player;
    const deleted = service.poll(request(generation, [health]), stores);
    expect(deleted.changes).toEqual([{ op: "delete", scope: "story", path: player.path }]);

    const removed = applyWatchPatches(snapshot.variables, deleted.changes);
    expect(Object.hasOwn(removed.story, "player")).toBe(false);

    stores.story.player = { health: 75, mana: 50 };
    const restored = service.poll(request(generation, [health]), stores);
    expect(restored.changes).toEqual([{
      op: "set", scope: "story", path: player.path, value: { health: 75, mana: 50 },
    }]);
    expect((applyWatchPatches(removed, restored.changes).story as Record<string, unknown>).player).toEqual(stores.story.player);
  });

  it("replaces a parent that becomes null, undefined, or a primitive", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { health: 100, mana: 25 } }, temporary: {},
    };
    const { service, generation, snapshot } = setup(stores.story);
    stores.story.player = null;
    const nullValue = service.poll(request(generation, [health]), stores);
    expect(nullValue.changes).toEqual([{ op: "set", scope: "story", path: player.path, value: null }]);
    let displayed = applyWatchPatches(snapshot.variables, nullValue.changes);
    expect((displayed.story as Record<string, unknown>).player).toBeNull();

    stores.story.player = 123;
    const primitive = service.poll(request(generation, [health]), stores);
    expect(primitive.changes).toEqual([{ op: "set", scope: "story", path: player.path, value: 123 }]);
    displayed = applyWatchPatches(displayed, primitive.changes);

    stores.story.player = {};
    const emptyParent = service.poll(request(generation, [health]), stores);
    expect(emptyParent.changes).toEqual([{ op: "set", scope: "story", path: player.path, value: {} }]);
    displayed = applyWatchPatches(displayed, emptyParent.changes);
    expect((displayed.story as Record<string, unknown>).player).toEqual({});

    stores.story.player = { health: 99, mana: 40 };
    const restored = service.poll(request(generation, [health]), stores);
    expect(restored.changes).toEqual([{
      op: "set", scope: "story", path: health.path, value: 99,
    }]);
  });

  it("notices when the earliest missing ancestor changes", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: {} }, temporary: {},
    };
    const { service, generation } = setup(stores.story);
    expect(service.poll(request(generation, [health]), stores).changes).toEqual([]);
    delete stores.story.player;
    expect(service.poll(request(generation, [health]), stores).changes).toEqual([
      { op: "delete", scope: "story", path: player.path },
    ]);
  });

  it("replaces synchronized state with each new full snapshot and ignores stale generations", () => {
    const stores = { story: { player: { health: 100 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    stores.story.player.health = 20;
    expect(service.poll(request(generation), stores).changes).toHaveLength(1);
    const next = service.capture(structuredClone(baseline(stores.story)));
    expect(next).not.toBe(generation);
    expect(service.poll(request(generation), stores).generation).toBe(next);
    expect(service.poll(request(next), stores).changes).toEqual([]);
  });

  it("handles circular watched objects without throwing on repeated comparisons", () => {
    const playerData: Record<string, unknown> = { health: 100 };
    playerData.self = playerData;
    const stores = { story: { player: playerData }, temporary: {} };
    const { service, generation } = setup(stores.story);
    expect(service.poll(request(generation), stores).changes).toEqual([]);
    playerData.health = 85;
    expect(service.poll(request(generation), stores).changes).toHaveLength(1);
    expect(service.poll(request(generation), stores).changes).toEqual([]);
  });

  it("watches whole Map/Set collections rather than unstable positional entries", () => {
    const targets: WatchTarget[] = [
      { scope: "story", path: [{ type: "property", key: "items" }, { type: "mapValue", index: 1 }] },
      { scope: "story", path: [{ type: "property", key: "items" }, { type: "mapKey", index: 0 }] },
      { scope: "story", path: [{ type: "property", key: "flags" }, { type: "setValue", index: 0 }] },
    ];
    expect(minimizeWatchTargets(targets)).toEqual([
      { scope: "story", path: [{ type: "property", key: "items" }] },
      { scope: "story", path: [{ type: "property", key: "flags" }] },
    ]);
    expect(minimizeWatchTargets([player, health])).toEqual([player]);
  });

  it("retains synchronized changes across watch removal and a different path reactivation", () => {
    const stores = { story: { player: { health: 10 } }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    let displayed = snapshot.variables;

    stores.story.player.health = 20;
    const changed = service.poll(request(generation, [player]), stores).changes;
    expect(changed).toEqual([{
      op: "set", scope: "story", path: player.path, value: { health: 20 },
    }]);
    displayed = applyWatchPatches(displayed, changed);

    // No active watches, and a value returns to its original snapshot value.
    expect(service.poll(request(generation, []), stores).changes).toEqual([]);
    stores.story.player.health = 10;

    // The newly watched descendant must compare with the already synchronized
    // hp=20, not the full snapshot's hp=10.
    const restored = service.poll(request(generation, [health]), stores).changes;
    expect(restored).toEqual([{
      op: "set", scope: "story", path: health.path, value: 10,
    }]);
    displayed = applyWatchPatches(displayed, restored);
    expect((displayed.story as { player: { health: number } }).player.health).toBe(10);
    expect(service.poll(request(generation, [health]), stores).changes).toEqual([]);
  });

  it("keeps synchronized parent structure across periods without visible watches", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 10 } }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const visibleHealth: WatchRequest = {
      generation, favorites: [], visible: [health],
    };
    const idle = { generation, favorites: [], visible: [] };
    const poll = () => service.poll(visibleHealth, stores).changes;
    expect(poll()).toEqual([]);

    (stores.story.player as Record<string, unknown>).mana = 5;
    const added = poll();
    expect(added).toEqual([{
      op: "set", scope: "story", path: [...player.path, { type: "property", key: "mana" }],
      value: 5,
    }]);
    let displayed = applyWatchPatches(snapshot.variables, added);
    expect(service.poll(idle, stores).changes).toEqual([]);

    delete (stores.story.player as Record<string, unknown>).mana;
    const removed = poll();
    expect(removed).toEqual([{
      op: "delete", scope: "story", path: [...player.path, { type: "property", key: "mana" }],
    }]);
    displayed = applyWatchPatches(displayed, removed);
    expect((displayed.story as { player: unknown }).player).toEqual({ health: 10 });
  });

  it("keeps aliased paths independently stale until each one is polled", () => {
    const shared = { health: 10 };
    const stores = { story: { left: shared, right: shared }, temporary: {} };
    const left: WatchTarget = {
      scope: "story", path: [{ type: "property", key: "left" }],
    };
    const right: WatchTarget = {
      scope: "story", path: [{ type: "property", key: "right" }],
    };
    const { service, generation, snapshot } = setup(stores.story);
    shared.health = 20;
    const first = service.poll(request(generation, [left]), stores).changes;
    expect(first).toEqual([{ op: "set", scope: "story", path: left.path, value: { health: 20 } }]);
    const displayed = applyWatchPatches(snapshot.variables, first);
    const copied = displayed.story as { left: { health: number }; right: { health: number } };
    expect(copied.left.health).toBe(20);
    expect(copied.right.health).toBe(10);
    expect(copied.left).not.toBe(copied.right);

    const second = service.poll(request(generation, [right]), stores).changes;
    expect(second).toEqual([{ op: "set", scope: "story", path: right.path, value: { health: 20 } }]);
    applyWatchPatches(displayed, second);
    expect(copied.right.health).toBe(20);
    expect(service.poll(request(generation, [right]), stores).changes).toEqual([]);
  });

  it("does not mutate another alias when a watched path is reassigned", () => {
    const shared = { health: 10 };
    const stores = { story: { left: shared, right: shared }, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const left: WatchTarget = { scope: "story", path: [{ type: "property", key: "left" }] };
    stores.story.left = { health: 90 };
    const changed = service.poll(request(generation, [left]), stores).changes;
    expect(changed).toEqual([{ op: "set", scope: "story", path: left.path, value: { health: 90 } }]);
    const displayed = applyWatchPatches(snapshot.variables, changed);
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
    const targets: WatchTarget[] = ["a", "b"].map((key) => ({
      scope: "story", path: [{ type: "property", key }],
    }));
    expect(() => service.poll(request(generation, targets), stores)).toThrow();
    stores.story.b = 4;
    expect(service.poll(request(generation, targets), stores).changes).toEqual([
      { op: "set", scope: "story", path: targets[0]!.path, value: 3 },
      { op: "set", scope: "story", path: targets[1]!.path, value: 4 },
    ]);
  });
});

describe("visible structural watch", () => {
  const root: WatchTarget = { scope: "story", path: [] };
  function visible(generation: number, entries: WatchTarget[]): WatchRequest {
    return { generation, favorites: [], visible: entries };
  }

  it("derives root structure from a visible top-level child", () => {
    const score: WatchTarget = {
      scope: "story", path: [{ type: "property", key: "score" }],
    };
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { score: 7 }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [score]), stores).changes;

    expect(poll()).toEqual([]);
    stores.story.newVariable = 15;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: [{ type: "property", key: "newVariable" }],
      value: 15,
    }]);
    delete stores.story.newVariable;
    expect(poll()).toEqual([{
      op: "delete", scope: "story", path: [{ type: "property", key: "newVariable" }],
    }]);
    // Without any visible rows or an explicit empty-root registration,
    // the service does not keep polling the nonempty root.
    expect(service.poll(visible(generation, []), stores).changes).toEqual([]);
  });

  it("checks a nonempty root without any visible child rows, but does not deep-watch collapsed values", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 100 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root]), stores).changes;

    expect(poll()).toEqual([]);
    (stores.story.player as Record<string, unknown>).health = 75;
    expect(poll()).toEqual([]);

    stores.story.newQuest = true;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: [{ type: "property", key: "newQuest" }],
      value: true,
    }]);
    delete stores.story.player;
    expect(poll()).toEqual([{
      op: "delete", scope: "story", path: player.path,
    }]);
  });

  it("deduplicates explicit root structure and structure inferred from a visible child", () => {
    const score: WatchTarget = {
      scope: "story", path: [{ type: "property", key: "score" }],
    };
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { score: 7 }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root, score]), stores).changes;

    expect(poll()).toEqual([]);
    stores.story.newQuest = 1;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: [{ type: "property", key: "newQuest" }],
      value: 1,
    }]);
    expect(poll()).toEqual([]);
  });

  it("tracks an empty root, additions, removals and restoration without missing watches", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: {}, temporary: {} };
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root]), stores).changes;
    expect(poll()).toEqual([]);
    stores.story.score = 7;
    const added = poll();
    expect(added).toEqual([{
      op: "set", scope: "story", path: [{ type: "property", key: "score" }], value: 7,
    }]);
    let displayed = applyWatchPatches(snapshot.variables, added);
    expect(displayed.story).toEqual({ score: 7 });
    delete stores.story.score;
    const removed = poll();
    expect(removed).toEqual([{ op: "delete", scope: "story", path: [{ type: "property", key: "score" }] }]);
    displayed = applyWatchPatches(displayed, removed);
    expect(displayed.story).toEqual({});
    stores.story.score = 9;
    displayed = applyWatchPatches(displayed, poll());
    expect(displayed.story).toEqual({ score: 9 });
    expect(poll()).toEqual([]);
  });

  it("observes empty expanded containers and their parent structure", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: {} }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [player]), stores).changes;
    expect(poll()).toEqual([]);
    (stores.story.player as Record<string, unknown>).hp = 100;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: player.path, value: { hp: 100 },
    }]);
    delete (stores.story.player as Record<string, unknown>).hp;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: player.path, value: {},
    }]);
    (stores.story.player as Record<string, unknown>).mp = 50;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: player.path, value: { mp: 50 },
    }]);
  });

  it("detects new siblings through the visible leaf's parent without cloning unchanged siblings", () => {
    const stores = { story: { player: { health: 100 } as Record<string, unknown> }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [health]), stores).changes;
    expect(poll()).toEqual([]);
    stores.story.player.mana = { max: 50 };
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: [...player.path, { type: "property", key: "mana" }],
      value: { max: 50 },
    }]);
    stores.story.player.health = 75;
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: health.path, value: 75,
    }]);
  });

  it("keeps scalar watches after replacing a visible object with a primitive", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { hp: 10 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [player]), stores).changes;
    expect(poll()).toEqual([]);
    stores.story.player = 10;
    expect(poll()).toEqual([{ op: "set", scope: "story", path: player.path, value: 10 }]);
    stores.story.player = 20;
    expect(poll()).toEqual([{ op: "set", scope: "story", path: player.path, value: 20 }]);
    expect(poll()).toEqual([]);
  });

  it("updates array lengths and new indices when visible, including empty arrays", () => {
    const stores = { story: { items: [] as number[] }, temporary: {} };
    const item: WatchTarget = { scope: "story", path: [{ type: "property", key: "items" }] };
    const { service, generation, snapshot } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [item]), stores).changes;
    expect(poll()).toEqual([]);
    stores.story.items.push(4);
    const added = poll();
    expect(added).toEqual([{
      op: "set", scope: "story", path: item.path, value: [4],
    }]);
    let displayed = applyWatchPatches(snapshot.variables, added);
    expect((displayed.story as Record<string, unknown>).items).toEqual([4]);
    stores.story.items.pop();
    displayed = applyWatchPatches(displayed, poll());
    expect((displayed.story as Record<string, unknown>).items).toEqual([]);
  });

  it("replaces a Map when keys are inserted rather than tracking unstable indices", () => {
    const stores = { story: { items: new Map<string, number>() }, temporary: {} };
    const item: WatchTarget = { scope: "story", path: [{ type: "property", key: "items" }] };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [item]), stores).changes;
    expect(poll()).toEqual([]);
    stores.story.items.set("key", 1);
    expect(poll()).toEqual([{
      op: "set", scope: "story", path: item.path, value: new Map([["key", 1]]),
    }]);
  });

  it("does not poll unregistered containers, but observes them when registered", () => {
    const stores = { story: { player: { hp: 10 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = (expanded: boolean) =>
      service.poll(visible(generation, expanded ? [root, player] : [root]), stores).changes;

    expect(poll(false)).toEqual([]);
    stores.story.player.hp = 20;
    expect(poll(false)).toEqual([]);
    // The first expanded poll compares the whole object to its baseline.
    expect(poll(true)).toEqual([
      { op: "set", scope: "story", path: player.path, value: { hp: 20 } },
    ]);
    expect(poll(true)).toEqual([]);
    stores.story.player.hp = 30;
    expect(poll(true)).toEqual([
      { op: "set", scope: "story", path: player.path, value: { hp: 30 } },
    ]);
    expect(poll(false)).toEqual([]);
  });

  it("does not clone an unchanged value subtree just to inspect structure", () => {
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } =
      { story: { player: { health: 7 } }, temporary: {} };
    const { service, generation } = setup(stores.story);
    const poll = () => service.poll(visible(generation, [root, player]), stores).changes;
    expect(poll()).toEqual([]);
    // Existing child value becomes non-cloneable, but only structure is watched.
    (stores.story.player as Record<string, unknown>).health = () => {};
    expect(poll()).toEqual([]);
  });
});

describe("watchPathExists", () => {
  it("distinguishes missing values from explicitly undefined values", () => {
    const stores = { story: { player: { health: undefined } }, temporary: {} };
    expect(watchPathExists(stores, health)).toBe(true);
    delete (stores.story.player as Record<string, unknown>).health;
    expect(watchPathExists(stores, health)).toBe(false);
    stores.story.player.health = undefined;
    expect(watchPathExists(stores, health)).toBe(true);
    (stores.story as Record<string, unknown>).player = null;
    expect(watchPathExists(stores, health)).toBe(false);
  });

  it("handles typed paths through array and Map/Set entries", () => {
    const stores = { story: {
      items: new Map([["a", 1]]),
      flags: new Set(["seen"]),
      list: [undefined],
    }, temporary: {} };
    const key = (path: WatchTarget["path"]): WatchTarget => ({ scope: "story", path });
    expect(watchPathExists(stores, key([{ type: "property", key: "items" }, { type: "mapValue", index: 0 }]))).toBe(true);
    expect(watchPathExists(stores, key([{ type: "property", key: "items" }, { type: "mapKey", index: 1 }]))).toBe(false);
    expect(watchPathExists(stores, key([{ type: "property", key: "flags" }, { type: "setValue", index: 0 }]))).toBe(true);
    expect(watchPathExists(stores, key([{ type: "property", key: "list" }, { type: "index", index: 0 }]))).toBe(true);
    expect(watchPathExists(stores, key([{ type: "property", key: "list" }, { type: "index", index: 1 }]))).toBe(false);
  });
});
