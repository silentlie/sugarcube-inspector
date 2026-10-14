import { describe, expect, it } from "vitest";
import { getVariableChildren, reconcileChildren, reconcileLiveChildren, refreshItem, updateTreeItem, type VariableNode } from "./variableNodes";

function parent(value: object): VariableNode {
  return { key: 0, location: { kind: "property", owner: { value }, key: "value" }, ancestors: [] };
}
function child(items: ReturnType<typeof reconcileChildren>, name: string) {
  return items.find((item) => item.location.kind === "property" &&
    item.location.key === name)!;
}

describe("ID-based tree reconciliation", () => {
  it("reuses matching child nodes before reconciliation without allocating candidates", () => {
    const value: Record<string, unknown> = { keep: 1, removed: 2 };
    const root = parent(value);
    const before = reconcileChildren(getVariableChildren(root));
    delete value.removed;
    value.added = 3;

    const candidates = getVariableChildren(root, new Map(before.map((node) => [node.key, node])));
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toBe(before[0]);
    expect(candidates[1]).not.toBe(before[1]);
    expect(candidates[1]?.location).toMatchObject({ kind: "property", key: "added" });

    const next = reconcileLiveChildren(root, before);
    expect(next[0]).toBe(before[0]);
    expect(next.map((node) => (node.location as { key: string }).key))
      .toEqual(["keep", "added"]);
  });

  it("detects expandability changes even when reusing old node identity", () => {
    const value: Record<string, unknown> = { child: 1 };
    const root = parent(value);
    const initial = reconcileChildren(getVariableChildren(root));
    expect(initial[0]?.isLeaf).toBe(true);
    value.child = { nested: true };

    const candidates = getVariableChildren(root, new Map(initial.map((node) => [node.key, node])));
    expect(candidates[0]).not.toBe(initial[0]);
    expect(candidates[0]?.key).toBe(initial[0]?.key);
    expect(candidates[0]?.location).toBe(initial[0]?.location);
    expect(candidates[0]?.isLeaf).toBe(false);

    const expanded = reconcileChildren(candidates, initial);
    expect(expanded[0]?.isLeaf).toBe(false);
    value.child = 0;
    const closed = reconcileChildren(getVariableChildren(root, new Map(expanded.map((node) => [node.key, node]))), expanded);
    expect(closed[0]?.isLeaf).toBe(true);
  });

  it("retains live Map entry locations across ID-based candidate reuse", () => {
    const key = { id: 1 };
    const value = new Map<unknown, unknown>([[key, { score: 1 }]]);
    const root = parent(value);
    const before = reconcileChildren(getVariableChildren(root));
    value.set(key, { score: 2 });
    const again = getVariableChildren(root, new Map(before.map((node) => [node.key, node])));
    expect(again[0]).toBe(before[0]);
    expect(again[0]?.location).toBe(before[0]?.location);
  });

  it("reuses the original array and VariableNodes when there are no structural changes", () => {
    const value = { first: 1, second: { count: 2 } };
    const root = parent(value);
    const first = reconcileChildren(getVariableChildren(root));
    const again = reconcileChildren(getVariableChildren(root), first);
    expect(again).toBe(first);
    expect(again[0]).toBe(first[0]);
    expect(again[1]?.location).toBe(first[1]?.location);
  });

  it("adds and removes IDs without rebuilding unchanged nodes or eager descendants", () => {
    const value: Record<string, unknown> = { keep: 1, remove: 2 };
    const root = parent(value);
    const before = reconcileChildren(getVariableChildren(root));
    const keep = child(before, "keep");
    delete value.remove;
    value.added = { nested: { deep: 3 } };
    const next = reconcileChildren(getVariableChildren(root), before);
    expect(next.map((item) => (item.location as {key: string}).key))
      .toEqual(["keep", "added"]);
    expect(child(next, "keep")).toBe(keep);
    expect(child(next, "added").children).toBeUndefined();
  });

  it("replaces only changed-owner loaded subtrees, preserving unchanged branches", () => {
    const value = { player: { health: 1 }, inventory: { item: "map" } };
    const root = parent(value);
    let items = reconcileChildren(getVariableChildren(root));
    items = updateTreeItem(items, child(items, "player").key, (item) => refreshItem(item, true));
    items = updateTreeItem(items, child(items, "inventory").key, (item) => refreshItem(item, true));
    const oldPlayer = child(items, "player");
    const oldInventory = child(items, "inventory");
    value.player = { health: 2 };
    const next = reconcileChildren(getVariableChildren(root), items);
    expect(child(next, "player")).not.toBe(oldPlayer);
    expect(child(next, "player").children?.[0]).not.toBe(oldPlayer.children?.[0]);
    expect(child(next, "inventory")).toBe(oldInventory);
    expect(child(next, "inventory").children).toBe(oldInventory.children);
  });


  it("keeps descendant IDs stable when ancestor VariableNodes are immutably copied", () => {
    const value = { stats: { health: 100 } };
    const root = parent(value);
    let items = reconcileChildren(getVariableChildren(root));
    const stats = child(items, "stats");
    items = updateTreeItem(items, stats.key, (item) => refreshItem(item, true));
    const first = child(items, "stats");
    const health = first.children![0]!;
    const copied = { ...first };

    // Immutable tree updates replace VariableNode objects, not their live locations.
    expect(getVariableChildren(copied)[0]!.key).toBe(health.key);
    value.stats.health = 80;
    const next = reconcileChildren(getVariableChildren(root), items);
    expect(child(next, "stats")).toBe(first);
    expect(child(next, "stats").children![0]).toBe(health);
  });

  it("updates expandability and reuses unchanged paths for targeted refresh", () => {
    const value: Record<string, unknown> = { player: { hp: 1 }, other: 2 };
    const root = parent(value);
    let items = reconcileChildren(getVariableChildren(root));
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
