# Immutable vs. direct mutable tree updates

The currently deployed inspector uses the **immutable** strategy.
The **mutable** approach is an isolated benchmark, not active in the extension.

## Reproduce

```bash
npm ci
npm run bench:tree
```

Source: [`tests/benchmarks/treeUpdates.bench.ts`](../tests/benchmarks/treeUpdates.bench.ts).
Results: [GitHub Actions run 38508850811](https://github.com/silentlie/sugarcube-inspector/actions/runs/38508850811),
Ubuntu 24.04, Node.js 24. Timings are medians in **milliseconds per
structural update**, lower is better.

| Root siblings | Target depth | Immutable | Mutable | Speedup |
|---:|---:|---:|---:|---:|
| 200 | 0 | 0.0484 | 0.0426 | 1.14× |
| 2,000 | 0 | 0.0637 | 0.0452 | 1.41× |
| 10,000 | 0 | 0.1521 | 0.0520 | 2.93× |
| 2,000 | 6 | 0.0664 | 0.0458 | 1.45× |

## Controlled workload

A tree of real `VariableNode` objects has one loaded target branch
and the specified number of root siblings. Each iteration changes the
name of a direct child property from `left` to `right` or vice versa,
forcing structural reconciliation.

Both strategies run the exact same `refreshItem()` function, including
live `getVariableChildren()` discovery and `reconcileChildren()`.

- **Immutable:** call `updateTreeItem(items, target.key, item => refreshItem(item, true))`,
  searching the loaded tree and copying ancestor objects and arrays.
- **Mutable:** call `refreshItem(target, true)`, assign the new child and
  leaf data onto that known node, then copy the root `items = [...items]`.
  The array copy models React's `setItems(prev => [...prev])` notification,
  but the test itself does not render React.
- **Sampling:** 150 warm-up updates per strategy, followed by 60
  alternating-order batches of 8 updates each, reporting the median
  per-update batch duration. Verify the resulting loaded child structures.

## What this does and does not demonstrate

For 10,000 root siblings, mutating the known item instead of recursively
searching saves **about 0.10 ms per structural update** in this sample.
The benefit is substantially smaller for 200 sibling nodes.

This measures **only our JavaScript tree-update domain**. It deliberately
does not include watcher polling, React scheduling, Ant's internal key
indexing, virtualization, DOM updates or frame pacing. Updating the
`treeData` root reference causes Ant to perform its internal processing
with **either** strategy, so there is no supported FPS conclusion.

The experiment tests a direct leaf structure change. It does not prove
a full mutable-tree implementation preserves watchers when ancestor
objects are replaced, cleans up detached nodes, or behaves correctly with
React concurrent rendering. Those need correctness and browser tests
before adopting mutation in production.

CI runner measurements are noisy: rerun locally several times before
interpreting small differences.
