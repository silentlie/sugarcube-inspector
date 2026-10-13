# SugarCube Inspector: lifecycle cost profile

**Benchmark:** [GitHub Actions run 38423669122](https://github.com/silentlie/sugarcube-inspector/actions/runs/38423669122) (raw artifact `inspection-lifecycle-results/lifecycle.json`). **Measured implementation:** [`e3dcd4d`](https://github.com/silentlie/sugarcube-inspector/commit/e3dcd4d4913e5a93f2fd4b63473e1df434b37c5a).

**Environment:** Ubuntu 24.04 GitHub runner, production WXT MV3 bundle built with temporary source instrumentation, Playwright headless Chromium 156, verified SugarCube 2.37.3 smoke story. Four repetitions each of 200, 2,000 and 10,000 root variables; five objects with eight children each, with one branch expanded after cold-open. Results are medians per scenario, not measurements from a Windows PC or actual game.

## End-to-end scenarios and browser costs

All times are milliseconds. Browser `TaskDuration`, `ScriptDuration`, `LayoutDuration` and `RecalcStyleDuration` are CDP cumulative counters sampled across the interaction plus a consistent ~150-ms settling period (idle case ~1050 ms); **do not add the columns**.

| Scenario | Root nodes | Task | Script | Layout | Style | First tree commit | First visible |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cold open Variables | 200 | 96.8 | 52.5 | 11.5 | 5.8 | 264.5 | 328.0 |
| Cold open Variables | 2,000 | 108.2 | 64.8 | 11.7 | 5.8 | 268.0 | 339.6 |
| Cold open Variables | 10,000 | 170.7 | 111.4 | 11.9 | 5.8 | 283.3 | 389.6 |
| Expand a branch | 200 | 59.5 | 34.5 | 1.0 | 2.2 | 49.0 | 85.5 |
| Expand a branch | 2,000 | 70.6 | 43.4 | 1.0 | 2.1 | 56.4 | 95.5 |
| Expand a branch | 10,000 | 102.7 | 69.0 | 1.0 | 1.9 | 79.7 | 128.3 |
| Add root property | 200 | 30.3 | 18.7 | 0.1 | 0.1 | 10.6 | n/a |
| Add root property | 2,000 | 43.3 | 21.8 | 0.1 | 0.1 | 15.1 | n/a |
| Add root property | 10,000 | 71.6 | 58.8 | 0.1 | 0.1 | 49.7 | n/a |
| Add nested property | 200 | 18.4 | 14.0 | 0.3 | 0.3 | 6.4 | n/a |
| Add nested property | 2,000 | 22.1 | 17.0 | 0.3 | 0.2 | 9.6 | n/a |
| Add nested property | 10,000 | 45.2 | 38.1 | 0.3 | 0.3 | 31.9 | n/a |
| Replace expanded object | 200 | 22.0 | 16.4 | 0.6 | 0.7 | 7.8 | n/a |
| Replace expanded object | 2,000 | 28.3 | 20.0 | 0.6 | 0.6 | 10.9 | n/a |
| Replace expanded object | 10,000 | 43.2 | 28.4 | 0.5 | 0.6 | 20.1 | n/a |
| Overview → Variables | 200 | 34.8 | 15.4 | 1.4 | 2.9 | none | 61.8 |
| Overview → Variables | 2,000 | 34.4 | 14.8 | 1.1 | 2.7 | none | 59.9 |
| Overview → Variables | 10,000 | 34.3 | 15.0 | 1.2 | 2.9 | none | 59.0 |
| Story → Temporary | 200 | 30.8 | 15.7 | 0.5 | 2.3 | 43.3 | 70.8 |
| Story → Temporary | 2,000 | 33.6 | 17.2 | 0.4 | 2.0 | 43.5 | 71.1 |
| Story → Temporary | 10,000 | 28.8 | 14.9 | 0.4 | 2.0 | 42.4 | 70.0 |

The `First visible` metric includes automation interaction/scheduling time, so it should not be read as pure JavaScript CPU time. Initial load has cold-start overhead absent from other scenarios.

## Our own source-code costs, exclusive CPU time

Individual instrumented function calls are timed by `performance.now()` and assigned *exclusive* elapsed time; time in an instrumented child function is subtracted from its instrumented parent's total. Each stage is therefore independent of nested function double counting. Instrumentation overhead is not subtracted.

### Adding a root property

| Exclusive stage | 200 nodes | 2,000 nodes | 10,000 nodes |
|---|---:|---:|---:|
| `readStructure` and `sameStructure` | 0.2 | 0.8 | 3.9 |
| `getVariableChildren`, `listChildren`, location IDs and names | 0.4 | 1.5 | 8.9 |
| `reconcileChildren`, `refreshItem`, `updateTreeItem`, expandability | 0.3 | 1.9 | 9.6 |
| Value reading, snapshot and preview | 0.7 | 0.7 | 0.8 |
| Inspector React component function calls | 1.3 | 1.0 | 1.2 |
| Watcher callback (exclusive) | 0.1 | 0.2 | 0.1 |
| Ant `titleRender` callback body | ~0.0 | 0.1 | 0.1 |
| **All instrumented functions** | **2.8** | **6.2** | **24.8** |

At 10,000 root variables, full-child discovery and ID creation plus reconciliation total **18.5 ms**, compared with 3.9 ms for the structural watcher scan. This supports enumeration, indexing and reconciliation as the important *measured application-code* costs for structural updates.

### Cold open, 10,000 root variables

| Exclusive stage | Median |
|---|---:|
| Child discovery / IDs | 15.8 ms |
| Tree reconciliation / expandability | 16.4 ms |
| Structure scan / compare | 5.6 ms |
| Value inspection | 3.6 ms |
| Inspector React component function bodies | 2.1 ms |
| **All named functions** | **44.2 ms** |
| **Browser ScriptDuration (whole window)** | **111.4 ms** |

The gap between whole-window script duration and named source timings **cannot be attributed specifically to Ant**. It includes React internals, Ant tree data processing, Prism rendering, SugarCube and unrelated callbacks, and measurement overhead. The two timing systems are not identical sampling instruments.

### Idle watcher work

An idle-poll scenario measured approximately 1.05 seconds with the expanded branch still open.

| Root variables | Structure scan/compare | Value inspection | All named functions | Total browser script |
|---|---:|---:|---:|---:|
| 200 | 0.5 ms | 0.9 ms | 1.6 ms | 2.8 ms |
| 2,000 | 1.4 ms | 1.0 ms | 2.6 ms | 3.9 ms |
| 10,000 | 11.1 ms | 1.3 ms | 12.5 ms | 14.1 ms |

**Important:** That 11.1 ms is spread across the full idle sampling window, not a single 11.1-ms frame. A structural watcher checks only its own object's direct properties, not the full recursively nested tree.

### Returning to Variables

At 200, 2,000 and 10,000 root variables respectively, reconciliation took **0 ms**, while measured `TaskDuration` was **34.8 / 34.4 / 34.3 ms** and visible latency was **61.8 / 59.9 / 59.0 ms**. This strongly suggests that the tab-switch cost in this workload is independent of root-tree rebuilding.

Browser style recalculation was 2.9 / 2.7 / 2.9 ms and layout was 1.4 / 1.1 / 1.2 ms. The remainder is **not yet individually attributed** among Ant tabs/tree internals, React scheduling, DOM updates, game code and automation overhead.

## Frames and limits

- At 10,000 roots, cold-open showed a **50.1-ms worst rAF interval** and expansion a **50.0-ms worst interval** in the benchmark run. A root-property addition showed **33.4 ms** at worst. Returning to the Variables tab showed approximately **16.8 ms**. The corresponding p95 is frequently the 60-Hz floor, making subtle FPS effects difficult to detect.
- The benchmark uses a synchronous watcher refresh for mutation scenarios to isolate the processing cost instead of adding up to 250 ms of polling detection latency. *Idle polling* retains the actual scheduler.
- Source-level render measurements track React component **function bodies**. Prism's child rendering and Ant/React framework internals can execute outside these functions. `titleRender` measures only the callback body, **not** all work it schedules.
- Paint/compositing time is **not independently isolated** by this run. CDP layout and style metrics are measured directly.
- The stages are exclusive within the instrumented application functions, but the CDP metrics are separately collected browser-wide counters. Do not sum the two sets.
- Headless Linux Chromium and simulated variable fixtures do **not** settle whether a real 144-Hz Windows Chrome session feels smoother.

## Findings / next target

1. Structural property enumeration, location ID generation, and reconcile processing scale with root size, especially during cold mount and root additions. Object allocation alone was not the full story.
2. On a large idle root, the structural watcher is a recurring cost (~11 ms/sec across all polling iterations), worth considering if very large roots are common, but it is not itself a 50-ms frame.
3. **Tab-return cost did not scale with root node count and had no reconciliation calls.** Profiling should next target the Ant Tabs/Tree and React presentation pipeline with browser tracing or deliberate ablations, rather than adding more tree reconciliation complexity.
4. Chrome's unattributed script time is still substantial. To name the dominant *framework* function, capture a CPU sampling profile/trace with JavaScript stack attribution on the actual computer where jank is felt.

## Reproduction

```sh
npm ci
npx playwright install chromium
npm run benchmark:lifecycle
```

Set `COST_SIZES=200,2000,10000` and `COST_REPEATS=4` in the environment to customise the workload. The script builds a temporary instrumented production extension from a detached worktree, writes `benchmark-results/lifecycle.json`, and cleans up the instrumented worktree. No profiler hooks are shipped in the normal extension build.

The GitHub workflow is kept as **manual `workflow_dispatch`**, not an automatic push-triggered benchmark.
