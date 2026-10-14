# Browser A/B: immutable versus direct mutable tree updates

Status: **measured; no compelling end-to-end benefit; production remains immutable**.

## Question and variants

Can an expanded `VariableNode` be updated directly instead of searching
the loaded tree with `updateTreeItem()`?

- **A, immutable:** watcher calls `updateTreeItem(old, node.key, item => refreshItem(item, true))`,
  creating new ancestor objects and arrays on the changed path.
- **B, mutable:** watcher receives the existing node reference, calls
  `refreshItem(node, true)`, copies updated fields into that node, then
  publishes `[...old]` to React. Ant's copied expansion event nodes were
  resolved by key during initial expansion.

Both variants used the exact same SugarCube story, live child enumeration,
reconciliation algorithm, 250 ms watcher, React component, Ant Design
virtualization, and Chromium runner. A build-time flag selected the strategy.

The test harness was deliberately temporary: it lived in commit
[`2618fa3`](https://github.com/silentlie/sugarcube-inspector/commit/2618fa33b0c4a582f463023ada9ee0148d4de032)
and has been removed from the production feature branch after measurement.
It is still available through Git history, together with its instructions.

## Method

[Passing GitHub Actions A/B workflow and JSON artifacts](https://github.com/silentlie/sugarcube-inspector/actions/runs/38510213783)
(Oct 14, 2026; Ubuntu 24.04, Playwright headless Chromium).
The workflow:

1. Built and loaded the **real extension** with each update strategy.
2. Created a SugarCube object tree with 200, 2,000, or 10,000 root siblings,
   or 2,000 siblings and a six-level-expanded nested target.
3. Alternated a visible expanded target leaf's property name between
   `tickA` and `tickB`. For each change, explicitly triggered the real
   `VariableWatcher.refresh()` to remove random 250 ms polling phase.
4. Timed until the new name appeared in Ant's DOM and the **next
   `requestAnimationFrame` callback**. This includes watcher processing,
   reconciliation, React scheduling, Ant indexing, and DOM rendering, but
   the callback is *before* final pixel painting, not proof of completed paint.
5. Captured 12 forced-refresh samples and three polling-inclusive samples
   per case, and sampled RAF gaps/Long Tasks (see raw JSON artifacts).
6. Validated the **mutable extension against all 22 existing Playwright
   regressions**, covering replacement, virtualized/offscreen nodes and more.
7. Repeated with **the opposite build order** on the same runner to check
   for warm-up/order bias.

Each reported value is median milliseconds for a structural update, lower
is better. These are short sample sets on hosted Linux, not a confidence
interval or a substitute for checking on a developer's machine.

## Observed forced-refresh latency

| Root siblings | Depth | Immutable, first order | Mutable, first order | Immutable, reversed | Mutable, reversed |
|---:|---:|---:|---:|---:|---:|
| 200 | 0 | 16.9 ms | 16.9 ms | 16.8 ms | 16.8 ms |
| 2,000 | 0 | 17.9 ms | 17.7 ms | 17.8 ms | 17.7 ms |
| 10,000 | 0 | 24.8 ms | 23.7 ms | 25.1 ms | 27.5 ms |
| 2,000 | 6 | 17.4 ms | 16.8 ms | 16.9 ms | 16.8 ms |

At **10,000 siblings**, the apparent advantage **reversed** depending on
build order: mutable was 1.1 ms faster in the first run and 2.4 ms slower
in the second. Differences at smaller sizes were tiny.

Polling-inclusive medians varied from approximately **224–243 ms** across
the verified runs, with no consistent strategy advantage. The usual
250 ms interval largely determines user-observed time to detection.

Sampled RAF-gap p95 values were approximately 16.4–16.6 ms across
both strategies. These sparse short-window values cannot establish
a stable frame-rate improvement or absence of jank.

## Interpretation

The [earlier domain-only benchmark](mutable-tree-update-benchmark.md)
showed around a 2.8–2.9× speedup of the isolated update function
at 10,000 siblings, saving only **about 0.1 ms per update**.
That improvement **did not translate into a repeatable
end-to-end improvement** in the actual inspector.

End-to-end processing includes watcher scans, React scheduling, and Ant's
own full-tree indexing/flattening. This A/B does not assign costs among
those components, but it shows that optimizing our recursive lookup
alone is unlikely to resolve visible delays.

The mutable test strategy passed 22 browser regressions. That is useful
correctness evidence, but it does **not** prove safety under every
React concurrent-rendering or detached-node scenario; it also mutates
nested objects previously exposed as React state.

**Decision:** keep immutable `updateTreeItem()` and avoid the added
mutability/lifetime bookkeeping without an observed user-facing win.

## Reproduce the historical benchmark

Check out [benchmark commit `2618fa3`](https://github.com/silentlie/sugarcube-inspector/commit/2618fa33b0c4a582f463023ada9ee0148d4de032)
in a disposable worktree, then run:

```bash
npm ci
npx playwright install chromium
npm run bench:tree:e2e
```

Run from the repository root. Results are written to
`tests/browser/.results/tree-update-ab.json`. The workflow additionally
used `TREE_AB_REVERSE=1 npm run bench:tree:e2e` to produce the
reverse-order JSON. Build artifacts and raw JSON are also attached to
the workflow run linked above.
