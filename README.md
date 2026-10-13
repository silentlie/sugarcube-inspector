# SugarCube Inspector: direct MAIN-world proof of concept

This experiment runs its React tree in Chrome's MAIN world, alongside SugarCube.
It does not attach a debugger or use a cross-world messaging bridge.

## User interface

- **Ant Design** provides the tabs, labels, buttons, dark/compact theme and virtualized Tree.
  No MUI, Tailwind, shadcn, or commercial UI dependencies are needed.
- Overview, Variables, and Scripts are top-level tabs. Under Variables are
  Story Variables, Temporary Variables, and Favorites. Overview, Scripts, and
  Favorites are placeholders.
- The variable tree uses Ant Design's built-in virtualization and discovers children
  lazily on expansion. All logical children remain accessible through scrolling.
- Variable rows syntax-highlight values with `prism-react-renderer` and its
  built-in VS Dark theme. Type labels reuse that palette instead of custom color
  definitions; the existing live-data behavior is unchanged.
- The remaining layout settings handle drawer geometry, its resize handle,
  and value truncation. Ant's dark/compact theme supplies the default styling.

## Behavior

- `VariableLocation` describes a direct owner/key or the trusted SugarCube
  `State.variables` / `State.temporary` store, with keys checked against the
  installed `StateAPI` type. Tree node models have no stored `children` arrays.
- `VariableSnapshot` discriminates actual values, accessors, and missing properties.
  Value previews and expandability are computed at read time, not implemented as
  live getters; non-enumerable properties remain inspectable.
- The drawer shows a loading status until `SugarCube.State` becomes available.
  Inspectors then use the required `getState(): StateAPI` accessor, which throws
  if the runtime unexpectedly loses its State API.
- Components read live SugarCube values directly without serialization or cloning.
  Runtime checks use named `@sindresorhus/is` type guards, including functions
  as expandable references. Boxed primitives are handled explicitly because the
  library's general-purpose type detector rejects them; their values remain inspectable.
- Independently watched rows update values while in view. Expanded, visible
  containers additionally watch structure, array length, and Map/Set membership.
  Structure snapshots use typed data, accessor, Map, and Set entries; enumerable
  and writable descriptor flags do not trigger tree rebuilds. Structural changes
  rebuild the tree model; ordinary value changes do not.
- `react-intersection-observer` tracks visible rows. Offscreen rows stop
  polling. A shared 250ms scheduler checks active subscriptions.
- References retain object identity; ancestor cycles are marked and stop
  recursive discovery. Ordinary property accessors are displayed without
  invoking them; type classification uses the library defaults.
- Unexpected inspection exceptions propagate unchanged instead of producing
  placeholder error snapshots or silently empty child lists. Such failures may
  interrupt the inspector; node-level error isolation is not part of this POC.
- The virtualized Tree limits mounted rows to the viewport, but Ant still indexes
  discovered logical children. The inspector is read-only.

## Shadow DOM integration

`entrypoints/content.tsx` mounts React in a manually created ShadowRoot in
Chrome's MAIN world. Ant's `StyleProvider` inserts styles in the ShadowRoot.
A dark and compact `ConfigProvider` directs popups to the inspector container.
A small scoped baseline avoids modifying the game's page.

Shadow DOM isolates appearance but not JavaScript. A hostile or broken game
can affect the inspector, and vice versa. Do not run on untrusted pages.

## Try it

1. Run `npm ci && npm run build`.
2. Load `.output/chrome-mv3` in `chrome://extensions` and allow local file access.
3. Open a SugarCube HTML game, reveal the drawer, and select
   Variables → Story Variables or Temporary Variables.
4. Expand objects and change game values. Visible entries update automatically.
5. Run `npm run lint && npm run compile && npm test && npm run test:browser`.

## Benchmark tab-switch jank on your own PC

A benchmark build exposes `scInspectorBench` to the game page's **MAIN-world DevTools console**.
It makes no changes to game variables and exports only numeric measurements.

1. Run `npm ci && npm run build:benchmark` from PowerShell or your terminal.
2. In `chrome://extensions`, load or reload `.output/chrome-mv3` and permit **Allow access to file URLs**.
3. Reload your actual SugarCube game. Open its drawer and select Overview.
4. In the game page's DevTools console, run:

```js
await scInspectorBench.run({ cycles: 8, from: "Overview" })
```

The first opening is reported separately from subsequent visits. Results include frame budget
(calibrated for your display), worst and p95 frame gaps, approximate missed frames,
50 ms+ long tasks, Ant React commit duration (if available in this build),
root reconciliation cost, row renders, and watcher creation/subscribe/read counts.

For jank caused by actual mouse interaction rather than scripted clicks:

```js
await scInspectorBench.record({ seconds: 15 })
```

Switch manually between Overview, Variables, and Scripts while recording.
The manual report gives per-click frame gaps. `aggregateStats` in the JSON
contains watcher and tree metrics for the full recording period.

To investigate causes, **reload the page between variants** and run one at a time:

```js
await scInspectorBench.run({ variant: "noTree" })      // Tabs only
await scInspectorBench.run({ variant: "noAnt" })       // Tree data, no Ant component
await scInspectorBench.run({ variant: "plainRows" })   // Ant, no live row renderer
await scInspectorBench.run({ variant: "noRootWatch" }) // Disable root polling
await scInspectorBench.run({ variant: "noRowWatch" })  // Disable visible row polling
```

Ablations are diagnostic, not intended as user-facing optimizations. The command restores
the original tab and variant when done; a reload resets the tree to its first-mount state.
If the tree was already mounted, the tool warns that there is no cold sample.

Copy the numeric report without sharing game data:

```js
copy(scInspectorBench.export())
```

**Important:** Use the page console, not the isolated extension service-worker console.
The benchmark is enabled for WXT development builds or `build:benchmark`, but omitted
from ordinary `npm run build` output. Headless CI and an open DevTools window can produce
different frame pacing from your normal browser. A 50 ms long task may be enough to miss
multiple frames, especially at 120/144 Hz.
