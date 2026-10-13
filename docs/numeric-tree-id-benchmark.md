# Numeric tree IDs: browser A/B benchmark

**Run:** [GitHub Actions #38481666602](https://github.com/silentlie/sugarcube-inspector/actions/runs/38481666602)
([raw JSON and full comparison](https://github.com/silentlie/sugarcube-inspector/actions/runs/38481666602/artifacts/11858690090)).

**Baseline:** string/path IDs at [`b4c3294`](https://github.com/silentlie/sugarcube-inspector/commit/b4c3294b949a45546fd23ec8f9aea09fcf28443a).

**Candidate:** numeric IDs at [`8677bd7`](https://github.com/silentlie/sugarcube-inspector/commit/8677bd7c72c880a988a87736483534adf6bd1228).

Both production extension builds ran the existing instrumented inspection lifecycle
harness in headless Chromium on Ubuntu 24.04 (Node 24), using three repetitions
per variant and 200, 2,000, and 10,000 story-root variables. The runs were
sequential, baseline first, not interleaved. Each measurement includes a
sampling window, so CDP TaskDuration and ScriptDuration are **not isolated ID
allocation times**.

## Browser TaskDuration (median, ms, lower is better)

| Scenario | Roots | String IDs | Numeric IDs | Difference |
|---|---:|---:|---:|---:|
| Cold open | 200 | 118.7 | 120.2 | +1.2% |
| Cold open | 2,000 | 133.7 | 129.0 | -3.6% |
| Cold open | 10,000 | 227.7 | 190.9 | -16.2% |
| Expand branch | 200 | 71.5 | 68.5 | -4.1% |
| Expand branch | 2,000 | 81.2 | 81.1 | -0.2% |
| Expand branch | 10,000 | 134.7 | 120.2 | -10.8% |
| Add root property | 200 | 34.4 | 32.8 | -4.9% |
| Add root property | 2,000 | 52.7 | 49.0 | -7.0% |
| Add root property | 10,000 | 86.1 | 76.1 | -11.7% |
| Return to Variables | 200 | 38.5 | 37.6 | -2.3% |
| Return to Variables | 2,000 | 40.4 | 40.5 | +0.3% |
| Return to Variables | 10,000 | 41.1 | 37.1 | -9.6% |

## Attribution and frame pacing

At **10,000 root variables**:

| Metric | Scenario | String IDs | Numeric IDs |
|---|---|---:|---:|
| Browser ScriptDuration | Cold open | 150.5 ms | 125.5 ms |
| Named instrumented functions (exclusive) | Cold open | 59.9 ms | 48.5 ms |
| Child discovery / ID (exclusive) | Cold open | 20.5 ms | 19.8 ms |
| Browser ScriptDuration | Add root property | 70.8 ms | 61.5 ms |
| Named instrumented functions (exclusive) | Add root property | 31.7 ms | 28.6 ms |
| Child discovery / ID (exclusive) | Add root property | 11.0 ms | 10.6 ms |
| Worst rAF interval | Cold open | 83.3 ms | 83.3 ms |
| Worst rAF interval | Add root property | 50.0 ms | 50.0 ms |
| Worst rAF interval | Expand branch | 66.6 ms | 50.0 ms |

The inclusive browser timings and the exclusive application-function timings
measure different scopes and **must not be added together**.
The baseline instruments `getLocationId`, while the candidate instruments
`getChildId`; the "Child discovery / ID" category also includes shared
enumeration and location-name processing.

Despite the large reduction in measured browser TaskDuration on 10,000-root
scenarios, **the isolated application-code improvement is modest**. The
remaining browser-time difference cannot confidently be attributed to IDs;
framework processing, scheduling, instrument overhead, and run-to-run drift
could contribute.

The cold-open and root-add worst frame intervals were unchanged. Numeric IDs
have **not been shown to fix visible jank**.

## Correctness and implementation

`VariableNode.id`, `Item.key`, `expandedKeys`, and targeted tree updates use
numbers. Two reserved root IDs are `0` and `1`. A weak registry assigns child
IDs based on the tree parent, live owner identity, child kind, and property/Map
key or Set member. This distinguishes alias paths, separates Map key/value
nodes, preserves unchanged IDs, and allocates fresh children when a parent
object is replaced. The old string/path ID helper is removed.

[CI for the candidate](https://github.com/silentlie/sugarcube-inspector/actions/runs/38481666766)
passed lint, TypeScript, unit/integration tests, and Chromium browser tests.

## Archived measurements

The source instrumentation, runner scripts and benchmark workflows were removed after these measurements were recorded. The linked GitHub Actions run and raw artifacts preserve the original results; the measured commits remain available in Git history. These results support a directional comparison, not a conclusive claim about desktop frame pacing.
