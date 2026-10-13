# Tree reconciliation: production browser A/B benchmark

Compared the recursive tree implementation at [f98ecf6c](https://github.com/silentlie/sugarcube-inspector/commit/f98ecf6c438598954ecef0af6316bed96e94c70a) against the ID-based structural-sharing implementation at [c02f236d](https://github.com/silentlie/sugarcube-inspector/commit/c02f236dea3631a8a004458e4fdde7dd11b9c43e).

The temporary harness built both revisions as independent **production Chrome extensions**, instrumenting each build in a temporary Git worktree. It loaded the real SugarCube smoke story in headless Chromium, used isolated browser profiles, alternated execution order, and measured 200, 2,000 and 10,000 root variables with expanded branches. Each GitHub Actions execution used five runs per variant and scenario. Two completed executions are linked below.

**Raw results and original runner:**
- [A/B run 1](https://github.com/silentlie/sugarcube-inspector/actions/runs/38418335048) (artifact: `tree-e2e-results`)
- [A/B run 2](https://github.com/silentlie/sugarcube-inspector/actions/runs/38418362984) (artifact: `tree-e2e-results`)

## Root addition, median CDP TaskDuration delta (ms)

| Root variables | Run 1 original | Run 1 shared | Run 2 original | Run 2 shared |
|---|---:|---:|---:|---:|
| 200 | 42.61 | 41.21 | 40.42 | 39.13 |
| 2,000 | 50.48 | 46.94 | 44.98 | 41.22 |
| 10,000 | 76.83 | 76.78 | 70.15 | 70.13 |

A root addition created 25 watchers in the original implementation and 0 in the shared implementation, for each measured trial's visible rows. Ant `titleRender` calls remained 125 in each variant.

## Returning from Overview to Variables

| Root variables | Run 1 visible (original / shared), ms | Run 2 visible (original / shared), ms |
|---|---|---|
| 200 | 70.8 / 72.0 | 68.7 / 70.6 |
| 2,000 | 71.7 / 68.9 | 68.3 / 68.6 |
| 10,000 | 71.8 / 72.2 | 70.3 / 69.4 |

`titleRender` calls remained 75 on tab return in both variants. No persuasive improvement in tab-switch latency or frame intervals appeared.

## Other structural updates

For in-place additions within an expanded node, watcher creations fell from 9 to 1, but total task time varied in both directions. Replacing an expanded object showed no consistent main-thread improvement across two runs. At 10,000 root nodes, root-add frame p95 was around **33.4 ms** for both variants in the first run; observed jank is not fixed.

## Measurement boundaries

- CDP `Performance.getMetrics` samples main-thread task/script/layout duration across a fixed window covering each change and 150 ms afterward. TaskDuration includes background and idle-window work, not just reconciliation.
- The measurement forces a synchronous `VariableWatcher.refresh()` after mutations to remove variable 250-ms polling latency from the comparison.
- `requestAnimationFrame` sampling is primed one frame before mutations so the first blocked frame is counted.
- React's production `Profiler` did **not** supply duration data. `titleRender` counts show calls to Ant's renderer, not React DOM commits or individual browser paint operations.
- Five repetitions per variant per workflow, repeated twice, are enough for a directional comparison, not a statistically powered claim of frame-rate improvement.
- The builds compare the full implementations at the listed commits, including correctness-related changes, rather than an isolated reconciler-only patch.
- Headless Linux Chromium may behave differently from a Windows desktop with DevTools open.

**Conclusion:** Structural sharing materially reduces watcher churn and modestly reduces main-thread time for some root updates. It does **not** demonstrably improve tab switching or frame pacing. Reconciliation is unlikely to be the main cause of the reported jank. The browser benchmark runner and its push-triggered workflow were temporary and removed after measurement.
