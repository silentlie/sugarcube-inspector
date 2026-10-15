import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileChildren, refreshItem, updateTreeItem, type VariableNode } from "./nodes";

function parent(value: object): VariableNode {
  return { key: 0, location: { kind: "property", owner: { value }, key: "value" }, ancestors: [] };
}
function child(items: ReturnType<typeof reconcileChildren>, name: string) {
  return items.find((item) => item.location.kind === "property" &&
    item.location.key === name)!;
}

afterEach(() => vi.unstubAllGlobals());

describe("ID-based tree reconciliation", () => {
  it("removes root children when the store becomes invalid and restores them when it recovers", () => {
    const state: { variables: unknown } = { variables: { original: 1 } };
    vi.stubGlobal("SugarCube", { State: state });
    const root: VariableNode = {
      key: 0,
      location: { kind: "state", key: "variables" },
      ancestors: [],
    };

    const original = reconcileChildren(root);
    expect(original.map((node) => node.location.kind === "property" && node.location.key))
      .toEqual(["original"]);

    state.variables = undefined;
    const missing = reconcileChildren(root, original);
    expect(missing).toEqual([]);

    state.variables = 42;
    expect(reconcileChildren(root, missing)).toBe(missing);

    state.variables = { restored: true };
    const recovered = reconcileChildren(root, missing);
    expect(recovered.map((node) => node.location.kind === "property" && node.location.key))
      .toEqual(["restored"]);
  });

  it("reuses the original array and VariableNodes when there are no structural changes", () => {
    const value = { first: 1, second: { count: 2 } };
    const root = parent(value);
    const first = reconcileChildren(root);
    const again = reconcileChildren(root, first);
    expect(again).toBe(first);
    expect(again[0]).toBe(first[0]);
    expect(again[1]?.location).toBe(first[1]?.location);
  });

  it("adds and removes IDs without rebuilding unchanged nodes or eager descendants", () => {
    const value: Record<string, unknown> = { keep: 1, remove: 2 };
    const root = parent(value);
    const before = reconcileChildren(root);
    const keep = child(before, "keep");
    delete value.remove;
    value.added = { nested: { deep: 3 } };
    const next = reconcileChildren(root, before);
    expect(next.map((item) => (item.location as {key: string}).key))
      .toEqual(["keep", "added"]);
    expect(child(next, "keep")).toBe(keep);
    expect(child(next, "added").children).toBeUndefined();
  });

  it("replaces only changed-owner loaded subtrees, preserving unchanged branches", () => {
    const value = { player: { health: 1 }, inventory: { item: "map" } };
    const root = parent(value);
    let items = reconcileChildren(root);
    items = updateTreeItem(items, child(items, "player").key, (item) => refreshItem(item, true));
    items = updateTreeItem(items, child(items, "inventory").key, (item) => refreshItem(item, true));
    const oldPlayer = child(items, "player");
    const oldInventory = child(items, "inventory");
    value.player = { health: 2 };
    const next = reconcileChildren(root, items);
    expect(child(next, "player")).not.toBe(oldPlayer);
    expect(child(next, "player").children?.[0]).not.toBe(oldPlayer.children?.[0]);
    expect(child(next, "inventory")).toBe(oldInventory);
    expect(child(next, "inventory").children).toBe(oldInventory.children);
  });


  it("keeps descendant IDs stable when ancestor VariableNodes are immutably copied", () => {
    const value = { stats: { health: 100 } };
    const root = parent(value);
    let items = reconcileChildren(root);
    const stats = child(items, "stats");
    items = updateTreeItem(items, stats.key, (item) => refreshItem(item, true));
    const first = child(items, "stats");
    const health = first.children![0]!;
    const copied = { ...first };

    // Reconciliation retains child IDs even when ancestor node objects are copied.
    expect(reconcileChildren(copied, first.children)[0]!.key).toBe(health.key);
    value.stats.health = 80;
    const next = reconcileChildren(root, items);
    expect(child(next, "stats")).toBe(first);
    expect(child(next, "stats").children![0]).toBe(health);
  });


  it("forgets IDs of removed children but retains surviving siblings", () => {
    const value: Record<string, unknown> = { first: 1, second: 2 };
    const root = parent(value);
    const initial = reconcileChildren(root);
    delete value.first;
    const removed = reconcileChildren(root, initial);
    expect(removed[0]).toBe(initial[1]);

    value.first = 3;
    const reinserted = reconcileChildren(root, removed);
    expect(child(reinserted, "second")).toBe(initial[1]);
    expect(child(reinserted, "first").key).not.toBe(initial[0]!.key);
  });

  it("reads a loaded node's location once per refresh", () => {
    let reads = 0;
    const owner = new Proxy({ player: { health: 10 } }, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "player") reads++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const node: VariableNode = {
      key: 2,
      location: { kind: "property", owner, key: "player" },
      ancestors: [],
    };

    const loaded = refreshItem(node, true);
    expect(reads).toBe(1);
    reads = 0;
    expect(refreshItem(loaded, true)).toBe(loaded);
    expect(reads).toBe(1);
  });

  it("updates expandability and reuses unchanged paths for targeted refresh", () => {
    const value: Record<string, unknown> = { player: { hp: 1 }, other: 2 };
    const root = parent(value);
    let items = reconcileChildren(root);
    const playerKey = child(items, "player").key;
    const other = child(items, "other");
    items = updateTreeItem(items, playerKey, (item) => refreshItem(item, true));
    const loaded = child(items, "player");
    const stable = updateTreeItem(items, playerKey, (item) => refreshItem(item, true));
    expect(stable).toBe(items);
    value.player = 1;
    const collapsed = updateTreeItem(items, playerKey, (item) => refreshItem(item));
    expect(child(collapsed, "player").isLeaf).toBe(true);
    expect(child(collapsed, "player").children).toBeUndefined();
    expect(child(collapsed, "other")).toBe(other);
    expect(loaded.children).toBeDefined();
  });
});
