import { describe, expect, it } from "vitest";
import { WatchService } from "./watchService";
import { applyWatchPatches } from "./applyWatchPatches";
import type { WatchRequest } from "./watch";

const playerPath = [{ type: "property" as const, key: "player" }];

function request(revision = 0): WatchRequest {
  return {
    session: "test-session",
    revision,
    targets: [{ scope: "story", path: playerPath }],
  };
}

describe("selective watch service", () => {
  it("sends a baseline once, then sends only nested changes", () => {
    const service = new WatchService();
    const stores = {
      story: { player: { health: 100, stats: { strength: 10 } }, untouched: 42 },
      temporary: {},
    };
    const initial = service.poll(request(), stores);
    expect(initial.patches).toEqual([{
      op: "set", scope: "story", path: playerPath,
      value: { health: 100, stats: { strength: 10 } },
    }]);
    expect(initial.revision).toBe(1);

    const unchanged = service.poll(request(1), stores);
    expect(unchanged.patches).toEqual([]);
    expect(unchanged.revision).toBe(1);

    stores.story.player.health = 75;
    stores.story.player.stats.strength = 12;

    const changed = service.poll(request(1), stores);
    expect(changed).toEqual({
      session: "test-session",
      baseRevision: 1,
      revision: 2,
      patches: [
        { op: "set", scope: "story", path: [...playerPath, { type: "property", key: "health" }], value: 75 },
        { op: "set", scope: "story", path: [...playerPath, { type: "property", key: "stats" }, { type: "property", key: "strength" }], value: 12 },
      ],
    });

    const inspector = applyWatchPatches({
      story: { player: { health: 100, stats: { strength: 10 } } },
      temporary: {},
    }, changed.patches);
    expect(inspector.story.player).toEqual(stores.story.player);
  });

  it("handles array insertions, removals, and missing paths", () => {
    const service = new WatchService();
    const stores: { story: Record<string, unknown>; temporary: Record<string, unknown> } = {
      story: { player: { inventory: ["sword", "potion"] } },
      temporary: {},
    };
    const initial = service.poll(request(), stores);
    const player = stores.story.player as { inventory: string[] };
    player.inventory.length = 1;
    player.inventory.push("key");

    const next = service.poll(request(initial.revision), stores);
    // Index 1 changes without copying the entire array.
    expect(next.patches).toEqual([{
      op: "set", scope: "story",
      path: [...playerPath, { type: "property", key: "inventory" }, { type: "index", index: 1 }],
      value: "key",
    }]);

    player.inventory.length = 0;
    const shorter = service.poll(request(next.revision), stores);
    const after = applyWatchPatches({ story: { player: { inventory: ["sword", "key"] } }, temporary: {} }, shorter.patches);
    expect((after.story.player as { inventory: unknown[] }).inventory).toEqual([]);

    delete stores.story.player;
    const missing = service.poll(request(shorter.revision), stores);
    expect(missing.patches).toEqual([
      { op: "delete", scope: "story", path: playerPath },
    ]);
  });

  it("recovers after a lost reply and supports Map and Set values", () => {
    const service = new WatchService();
    const stores = {
      story: { player: { items: new Map([["a", { count: 1 }]]), flags: new Set(["seen"]) } },
      temporary: {},
    };
    const first = service.poll(request(), stores);
    stores.story.player.items.get("a")!.count = 2;
    const second = service.poll(request(first.revision), stores);
    expect(second.patches).toEqual([{
      op: "set", scope: "story",
      path: [...playerPath, { type: "property", key: "items" }],
      value: new Map([["a", { count: 2 }]]),
    }]);

    // A lost response means the inspector still acknowledges revision 1.
    const resync = service.poll(request(first.revision), stores);
    expect(resync.baseRevision).toBe(first.revision);
    expect(resync.patches).toEqual([{
      op: "set", scope: "story", path: playerPath,
      value: stores.story.player,
    }]);
  });
});
