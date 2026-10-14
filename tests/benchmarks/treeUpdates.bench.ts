import { describe, it } from "vitest";
import { performance } from "node:perf_hooks";
import { getVariableChildren, reconcileChildren, refreshItem, updateTreeItem, type VariableNode } from "../../src/inspector/variableNodes";

/**
 * Domain-only benchmark. Excludes React, Ant indexing, watcher polling,
 * and frames; both strategies run the same child discovery / reconciliation.
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


function sample(update: () => void, count: number): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) update();
  return (performance.now() - start) / count;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >>> 1]! + sorted[sorted.length >>> 1]!) / 2;
}

for (const [width, depth] of [
  [200, 0],
  [2_000, 0],
  [10_000, 0],
  [2_000, 6],
] as const) {
  describe(`tree update: ${width} siblings, depth ${depth}`, () => {
    it("reports per-update timings for immutable and mutable implementations", () => {
      const immutable = makeFixture(width, depth, "immutable");
      const mutable = makeFixture(width, depth, "mutable");

      // Warm up JIT code and the stable-ID registries before measuring.
      for (let i = 0; i < 150; i++) {
        immutable();
        mutable();
      }

      const immutableSamples: number[] = [];
      const mutableSamples: number[] = [];
      // Alternate order to reduce systematic CPU/frequency drift.
      for (let i = 0; i < 60; i++) {
        if (i % 2 === 0) {
          immutableSamples.push(sample(immutable, 8));
          mutableSamples.push(sample(mutable, 8));
        } else {
          mutableSamples.push(sample(mutable, 8));
          immutableSamples.push(sample(immutable, 8));
        }
      }
      const im = median(immutableSamples);
      const mu = median(mutableSamples);
      // Results in milliseconds per update, including a new root array for
      // the mutable variant. No assertion on noisy benchmark ratios.
      console.log(
        `TREE_BENCH width=${width} depth=${depth} ` +
        `immutable_ms=${im.toFixed(4)} mutable_ms=${mu.toFixed(4)} ` +
        `speedup=${(im / mu).toFixed(2)}x`,
      );
    }, 60_000);
  });
}
