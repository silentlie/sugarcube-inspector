# Deferred watch-performance notifications

**Status:** Deferred (removed from the inspector UI on 2026-10-10). This document
preserves the previous design as historical context, **not** an agreed
specification for a future implementation.

## Why this was removed

The inspector still polls watched paths every 250 ms, but its recommendation
and warning banners have been removed while their design is reconsidered.
The original thresholds were provisional and have not been validated against
representative SugarCube stories, main-thread frame pacing, or user experience.
Do not re-enable these notices solely on the strength of synthetic benchmarks.

## Previous design (removed)

- Each successful `getWatchChanges` response included `mainDurationMs`,
  the synchronous time spent processing the watch poll in the page's MAIN
  world. RPC transport / round-trip latency was **not** used for the notices.
- Retain a rolling window of the most recent **20** MAIN-world poll durations.
- **Recommendation:** after collecting 20 samples, show a dismissible
  suggestion to reduce watched variables if the window's **p95 exceeds 10 ms**.
  The recommendation cleared automatically if p95 dropped to **8 ms or less**.
- **Warning:** show a dismissible warning immediately when a single poll
  exceeded **50 ms**; the warning took precedence over recommendations.
- Dismissals lasted for the lifetime of the mounted provider and were tracked
  separately for each notice level.

These were UI-only performance heuristics, not conditions for stopping
polling, pruning targets, invalidating the two-layer cache, or resynchronizing
snapshots.

## Behaviour while deferred

There is no automatic performance recommendation, warning, dismissal button,
rolling sample window, or p95 evaluation in `WatchProvider`. Watch polling,
pause-on-hidden, error recovery, and snapshot generation checks are unchanged.
The watch RPC still returns `mainDurationMs` as existing timing instrumentation,
but the inspector does not currently consume it to display notifications.

## Questions for a future redesign

1. **Useful measurement:** Correlate MAIN-world synchronous work with
   actual frame delays on representative games. Determine whether to measure
   poll work, full request cost, long tasks, or several metrics together.
2. **Thresholds and severity:** Reassess trigger values, sampling window,
   spike versus sustained slowdown, hysteresis, and how to avoid noisy alerts.
   The old 10/50 ms values are historical, not endorsed defaults.
3. **Actionability:** Decide what a notice should explain and whether it can
   identify costly paths, recommend unwatching targets, or expose a simple
   watch-performance breakdown.
4. **Interaction:** Decide whether recommendations should auto-clear, how
   escalation works, whether dismissals persist, and whether notices can be
   disabled. Keep timing bookkeeping from creating unnecessary React renders.
5. **Verification:** Add tests for warning transitions, dismissals, resyncs,
   and hidden-tab behaviour, plus profiling of real SugarCube stories before
   enabling UI notifications again.

Do not change the 250 ms polling cadence or the existing two-layer cache
solely to reintroduce notifications; treat that as a separate performance
decision.
