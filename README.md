# SugarCube Inspector

SugarCube Inspector runs its React variable tree in Chrome's MAIN world, alongside SugarCube.
It reads live story and temporary variables directly without attaching a debugger or using a cross-world messaging bridge.

## User interface

- **Ant Design** provides tabs, labels, buttons, dark/compact theme and the virtualized Tree.
- **Tailwind CSS v4** handles layout, spacing and text utilities. Its Preflight reset is deliberately omitted to preserve Ant Design component styles.
- Overview, Variables, and Scripts are top-level tabs. Under Variables are
  Story Variables, Temporary Variables, and Favorites. Overview, Scripts, and
  Favorites are placeholders.
- The variable tree uses Ant Design's built-in virtualization and discovers children
  lazily on expansion. ID-based, one-level reconciliation reuses unchanged nodes and
  child arrays; replaced objects refresh only loaded branches. Expanded logical
  nodes retain structural subscriptions even when their rows are virtualized,
  so offscreen changes update Ant tree data without waiting for a row remount.
  All logical children remain accessible through scrolling.
- Variable rows syntax-highlight values with `prism-react-renderer` and its
  built-in VS Dark theme. Type labels reuse that palette instead of custom color
  definitions; the existing live-data behavior is unchanged.
- Tailwind classes provide static drawer/layout styling; inline styles remain for live width, open/closed transform and Ant Design theme tokens.

## Behavior

- `VariableLocation` describes a direct owner/key or the trusted SugarCube
  `State.variables` / `State.temporary` store, with keys checked against the
  installed `StateAPI` type. A single `VariableNode` holds both live location and
  Ant tree state, with lazily loaded `children`; unchanged items are reused by ID.
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
- Mounted virtualized rows update values while the Variables tab is visible.
  All expanded logical containers watch object identity, structure, array length,
  and Map/Set membership, including while their rows are offscreen.
  Structure snapshots use typed data, accessor, Map, and Set entries; enumerable
  and writable descriptor flags do not trigger tree rebuilds. Structural changes
  rebuild the tree model; ordinary value changes do not.
- A single `react-intersection-observer` tracks each Variables panel's visibility.
  `VariableWatcher` pauses the corresponding scope when its tab is hidden and
  refreshes subscribed snapshots when it becomes visible again. Ant Tree unmounts
  offscreen row-value subscriptions; expanded-container subscriptions instead
  remain until their branches collapse or disappear. A shared 250ms scheduler
  checks only active subscriptions.
- References retain object identity; ancestor cycles are marked and stop
  recursive discovery. Ordinary property accessors are displayed without
  invoking them; type classification uses the library defaults.
- Unexpected inspection exceptions propagate unchanged instead of producing
  placeholder error snapshots or silently empty child lists. Such failures may
  interrupt the inspector; node-level error isolation is not currently implemented.
- The virtualized Tree limits mounted rows to the viewport, but Ant still indexes
  discovered logical children. The inspector is read-only.

## Shadow DOM integration

`entrypoints/content.tsx` mounts React in a manually created ShadowRoot in
Chrome's MAIN world. Ant's `StyleProvider` inserts styles in the ShadowRoot.
A dark and compact `ConfigProvider` directs popups to the inspector container.
Tailwind utilities and the scoped tabs/tree flex-height rules are compiled into one stylesheet and mounted only inside that ShadowRoot. The game page receives no CSS reset.

Tailwind uses `@tailwindcss/vite` and an inline CSS-string import in the MAIN-world entrypoint. `cssInjectionMode: "manual"` prevents automatic document-level stylesheet injection.

Shadow DOM isolates appearance but not JavaScript. A hostile or broken game
can affect the inspector, and vice versa. Do not run on untrusted pages.

## Try it

1. Run `npm ci && npm run build`.
2. Load `.output/chrome-mv3` in `chrome://extensions` and allow local file access.
3. Open a SugarCube HTML game, reveal the drawer, and select
   Variables → Story Variables or Temporary Variables.
4. Expand objects and change game values. Visible entries update automatically.
5. Run `npm run lint && npm run compile && npm test && npm run test:browser`.

## Compare tree update strategies

Run `npm run bench:tree` to compare the current immutable `updateTreeItem()`
search and ancestor copying against updating the known `VariableNode` directly,
then copying the root array (`setItems([...items])`). Fixtures contain 200, 2,000,
and 10,000 root siblings and one six-level-deep branch. Both strategies perform
identical live child discovery and reconciliation. Results report JavaScript domain
update throughput only; they deliberately **exclude** React, Ant's full tree
indexing/rendering, watcher polling, and frame rates. The mutable strategy is an
isolated experiment, not enabled in the extension. Compare results on the same
machine and repeat runs because short microbenchmarks are noisy.

Measurement details: [immutable vs. mutable tree updates](docs/mutable-tree-update-benchmark.md).
