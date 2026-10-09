# Experimental watch strategies and Chromium RPC benchmark

The production watcher is unchanged. This document records experimental
implementations in [`watchEqual.ts`](../src/sugarcube/watchEqual.ts) and
[`watchPollingVariants.ts`](../src/sugarcube/watchPollingVariants.ts).

**Verified:** [GitHub Actions run 37955702289](https://github.com/silentlie/sugarcube-inspector/actions/runs/37955702289)
on Ubuntu / Node 22 and Chromium 156. All 72 Chromium MAIN ↔ isolated-world
RPC scenarios, 81 Node worker round-trip scenarios and 21 deep-equality
comparison scenarios passed correctness checks. Download machine-readable
benchmark results from the run's `watch-variant-benchmark-results` artifact
(7-day retention).

## Reproduce locally

Install benchmark-only dependencies without modifying the project lockfile:

```bash
npm ci
npm install --no-save --package-lock=false --ignore-scripts fast-equals@6.1.1 fast-deep-equal@3.1.3 dequal@2.0.3 esbuild@0.28.2
npx playwright install chromium
npm run bench:watch:equality -- equality.json
npm run bench:watch:variants -- worker.json
npm run bench:watch:chromium -- chromium.json
```

Benchmark-only packages are not production dependencies. The Chromium runner
bundles the real `@webext-core/messaging/page` library into synthetic MAIN
and isolated execution worlds on `about:blank`. It excludes CDP control
latency and uses synthetic SugarCube-style state, **not a live story**.
Each Chromium scenario runs 12 warmups and 35 measured, sequential requests.
The p95 estimates therefore have a small sample size.

## Chromium cross-world RPC

Median round-trip time in **milliseconds**. The comparator for the
`compare-first` and `clone-first` columns is `keys-weak`.

| Scenario | Compare before clone | Clone before compare | Always clone |
| --- | ---: | ---: | ---: |
| Flat 10K, unchanged | **1.6** | 3.5 | 6.0 |
| Flat 10K, changing each poll | 7.2 | 7.2 | **6.0** |
| Nested 10K, unchanged | **0.5** | 0.8 | 1.1 |
| Nested 10K, changing each poll | 1.2 | 1.2 | **1.1** |
| Array 10K, unchanged | **1.7** | 4.2 | 8.6 |
| Array 10K, changing each poll | 10.1 | 10.1 | **9.7** |
| Map 2K, unchanged | **0.4** | 0.9 | 1.7 |
| Map 2K, changing each poll | 2.6 | 2.6 | **1.7** |

Values are illustrative of this run, not guaranteed production latencies.
MAIN-thread work and RPC round-trip costs are separately reported in JSON.
The compare-first win for unchanged values comes from avoiding cloning and
transferring them. With a change on every poll, comparison is usually overhead.

### Array traversal experiment

| Change pattern, 10K array objects | Keys-first | Forward values-first | Reverse values-first |
| --- | ---: | ---: | ---: |
| Unchanged, Chromium round trip | 1.7 ms | 1.7 ms | **1.6 ms** |
| Frequently changed early index, Chromium round trip | 10.1 ms | **9.1 ms** | 11.9 ms |
| Unchanged, comparison only | 2.066 ms | 2.057 ms | **2.034 ms** |
| Change at first index, comparison only | 0.104 ms | **0.00013 ms** | 2.021 ms |
| Change at last index, comparison only | 2.069 ms | 1.924 ms | **0.00013 ms** |

`fast-equals/deepEqual` also detects tail mutations almost immediately,
but its ordinary comparator does not support circular graphs. The custom
variants preserve graph alias checks, at some CPU cost.

### Reference tracking

`WeakMap`, `Map`, and lazy promotion (single initial pair, then
`WeakMap`) all preserve graph-sharing checks in the test fixtures.
Results are workload dependent, with **no consistent winner**.
For example, the 2K-entry unchanged Map over Chromium returned about
0.2–0.4 ms with compare-first depending on tracking variant; this difference
is not enough evidence to add adaptive reference tracking.

## External equality libraries

Comparison-only, median in milliseconds, independently cloned inputs.
Unsupported / incorrect results are excluded.

| Unchanged value | Optimized custom | fast-equals/deepEqual | fast-equals/circular | dequal |
| --- | ---: | ---: | ---: | ---: |
| Flat object, 10K | **1.707** | 1.745 | 1.718 | see JSON |
| Nested objects, 10K | **0.443** | 0.446 | 0.455 | see JSON |
| 10K array objects | 2.066 | **0.698** | 1.812 | see JSON |
| Primitive-key Map, 2K | **0.246** | 7.364 | 7.602 | see JSON |
| Typed array, 200K bytes | **0.0256** | 0.0975 | 0.0977 | see JSON |
| Cyclic graph, 1K | **0.130** | unsupported | 0.168 | unsupported |

The custom comparator performs well on typed arrays, Maps and cyclic
graphs but does not beat the non-circular `fast-equals/deepEqual` on
arrays. Reordered Maps/Sets are conservatively considered changed.
Unsupported opaque types are also considered changed.

## Recommendation

**Compare-before-clone** is the best simple default to explore for large,
mostly unchanged watched values. Directly return or clone small primitives.
Always-clone may win for values that change every poll. Preserve the separate
250 ms slow-request warning, but also measure synchronous MAIN-world CPU,
since 10–20 ms of page work may cause frame drops.

Do not switch production to these variants based on this one synthetic
benchmark. Test realistic game objects, UI visibility, actual polling
cadence and Chrome profiling before choosing an adaptive strategy.
