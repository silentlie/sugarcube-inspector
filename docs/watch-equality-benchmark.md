# SugarCube watch equality benchmark

This historical experiment compares the script's original custom
fail-fast comparator, the optimized `equalWatchedValues` implementation in
[`src/sugarcube/watchEqual.ts`](../src/sugarcube/watchEqual.ts),
and external deep-equality libraries.

**Production uses `fast-equals/deepEqual`, with a circular-data fallback,
not either custom comparator.** Results below belong to the cited benchmark
run and are not measurements of the current live watch RPC.

## Reproduce

```bash
npm install --no-save --package-lock=false --ignore-scripts fast-equals@6.1.1 fast-deep-equal@3.1.3 dequal@2.0.3
npm run bench:watch:equality -- watch-equality-results.json
```

The benchmark runs on independently cloned inputs. It checks each
implementation against each fixture before timing it, excluding any
comparator that reports incorrect equality or throws.

## Measured results (Node.js 22.23.3, Ubuntu runner)

These are **single-run median detection-only times**, in milliseconds,
from [CI run 37951173851](https://github.com/silentlie/sugarcube-inspector/actions/runs/37951173851).
The complete JSON output is printed in the benchmark job's log.

| Unchanged value | Optimized custom | Previous custom | fast-equals/deepEqual | fast-equals/circular | dequal |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10K flat properties | 2.327 | 2.334 | 2.354 | 2.350 | 2.554 |
| 10K nested properties | 0.712 | 0.710 | 0.743 | 0.694 | 1.087 |
| 10K array objects | 3.209 | 2.451 | **1.269** | 3.755 | 1.634 |
| 2K primitive-keyed Map entries | 0.446 | 0.288 | 11.118 | 11.703 | **0.249** |
| 200 object-keyed Map entries | 0.073 | **0.051** | 0.152 | 0.228 | 1.770 |
| 200K-byte typed array | **0.049** | 0.188 | 0.189 | 0.190 | 0.188 |
| 1K-node cyclic graph | 0.215 | **0.207** | unsupported | 0.256 | unsupported |

The `fast-deep-equal/es6` variant is also tested by the script,
but was excluded from this table for space. Its unchanged 10K-array
result was 1.502 ms. It failed the cloned object-keyed Map and
object-containing Set correctness checks.

## Interpretation

- **The optimized custom checker beats `fast-equals/circular`** on the
  unchanged array, typed-array, and cyclic scenarios shown above.
- **It does not beat the fastest library overall**. Without circular
  support, `fast-equals/deepEqual` is substantially faster on arrays.
- The new typed-array word-comparison fast path made the clearest
  improvement relative to the previous checker.
- Bidirectional graph-identity tracking costs CPU. Unlike the previous
  comparator, the new checker rejects different shared-reference graphs
  with otherwise equal leaf values.
- Deep equality is still O(N) on unchanged object graphs. Cloning and
  sending unconditionally remains cheaper on some small and frequently
  changed values.
- The custom comparator intentionally treats reordered Map/Set
  collections as changed, even if their members compare equal.
- Unsupported opaque values are conservatively treated as changed.

These benchmarks simulate response copying with `structuredClone`;
they **do not measure Chromium MAIN-to-isolated-world RPC latency or
game-frame contention**. Times can fluctuate with runner load and V8
optimizations. The separate
[Chromium transport benchmark](watch-polling-benchmarks.md) addresses
synthetic cross-world RPC, but still does not measure real game frame pacing.
Neither result alone justifies changing the production comparator.
