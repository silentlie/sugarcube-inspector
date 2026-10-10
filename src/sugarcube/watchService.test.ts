import { describe, expect, it } from "vitest";
import { WatchService } from "./watchService";
import { applyWatchPatches } from "./applyWatchPatches";
import { minimizeWatchTargets, type WatchRequest, type WatchTarget } from "./watch";
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
  return { service, generation, snapshot };
}
function request(generation: number, targets: WatchTarget[] = [player]): WatchRequest {
  return { generation, targets };
}

describe("two-layer selective watch service", () => {
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

    // The cache must retain a clone, not the mutable live object.
    const updated = applyWatchPatches(snapshot.variables, response.changes);
    expect(((updated.story as Record<string, unknown>).player as { health: number }).health).toBe(75);
    expect(service.poll(request(generation), stores).changes).toEqual([]);
    stores.story.player.stats.strength = 12;
    expect(service.poll(request(generation), stores).changes).toEqual([{
      op: "set", scope: "story", path: player.path,
      value: { health: 75, stats: { strength: 12 } },
    }]);
  });

  it("keeps separate path baselines when snapshot paths alias the same object", () => {
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

  it("clears watch overrides with each new full snapshot and ignores stale generations", () => {
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
