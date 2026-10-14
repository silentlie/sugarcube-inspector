import { bench, describe } from "vitest";
import { getVariableChildren, reconcileChildren, refreshItem, updateTreeItem, type VariableNode } from "../../src/inspector/variableNodes";

/**
 * Domain-only benchmark: identical child discovery / reconciliation on both
 * sides. Excludes React rendering, Ant indexing, 250ms watcher and scheduling.
 *
 * Run: npm run bench:tree
 */
type Strategy = "immutable" | "mutable";

function makeFixture(width: number, depth: number, strategy: Strategy) {
  const leaf: Record<string, number> = { left: 1 };
  let branch: object = leaf;
  for (let i = 0; i < depth; i++) branch = { nested: branch };
  const store: Record<string, unknown> = Object.fromEntries(
    Array.from({ length: width - 1 }, (_, index) => [`sibling${index}`, index]),
  );
  store.target = branch;
  const root: VariableNode = {
    key: 0,
    location: { kind: "property", owner: { store }, key: "store" },
    ancestors: [],
  };
  let items = reconcileChildren(getVariableChildren(root));
  const targetKey = items[items.length - 1]!.key;
  let target = items[items.length - 1]!;

  // Load a single branch, as a real user expanding its nodes would.
  for (let i = 0; i <= depth; i++) {
    if (strategy === "immutable") {
      items = updateTreeItem(items, target.key, (item) => refreshItem(item, true));
      let current = items[items.length - 1]!;
      for (let level = 0; level < i; level++) current = current.children![0]!;
      target = i < depth ? current.children![0]! : current;
    } else {
      const updated = refreshItem(target, true);
      target.isLeaf = updated.isLeaf;
      target.children = updated.children;
      target.loadedValue = updated.loadedValue;
      if (i < depth) target = target.children![0]!;
    }
  }

  let flipped = false;
  return function update() {
    // Change exactly one property's name every time, forcing reconciliation.
    if (flipped) {
      delete leaf.right;
      leaf.left = 1;
    } else {
      delete leaf.left;
      leaf.right = 1;
    }
    flipped = !flipped;

    if (strategy === "immutable") {
      items = updateTreeItem(items, target.key, (item) => refreshItem(item, true));
      // Reacquire the current immutable node on the known loaded path.
      let current = items[items.length - 1]!;
      for (let i = 0; i < depth; i++) current = current.children![0]!;
      target = current;
    } else {
      // The proposed direct-node approach: mutate one known item and notify
      // React with a new root array. We use the *same* refreshItem calculation.
      const updated = refreshItem(target, true);
      if (updated !== target) {
        target.isLeaf = updated.isLeaf;
        target.children = updated.children;
        target.loadedValue = updated.loadedValue;
        items = [...items];
      }
    }

    // Keep the root live and catch regressions where the target detaches.
    if (items[items.length - 1]!.key !== targetKey) throw new Error("Target detached");
  };
}

for (const [width, depth] of [
  [200, 0],
  [2_000, 0],
  [10_000, 0],
  [2_000, 6],
] as const) {
  describe(`tree update: ${width} siblings, depth ${depth}`, () => {
    // Each benchmark has its own mutable fixture and toggles the same change.
    for (const strategy of ["immutable", "mutable"] as const) {
      const update = makeFixture(width, depth, strategy);
      bench(strategy, update, { time: 600, warmupTime: 150 });
    }
  });
}
