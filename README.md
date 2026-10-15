# SugarCube Inspector

SugarCube Inspector runs its React variable tree in Chrome's MAIN world, alongside SugarCube.
It reads live story and temporary variables directly without attaching a debugger or using a cross-world messaging bridge.

## User interface

- **Ant Design** provides tabs, labels, buttons, dark/compact theme and the virtualized Tree.
- Theme settings remain independent: `src/theme/antd.ts` configures Ant Design's dark/compact algorithms, while `src/theme/prism.ts` selects Prism's unmodified VS Dark syntax theme. No shared theme provider or colour overrides are introduced.
- **Tailwind CSS v4** provides its complete stylesheet, including Preflight and utilities, inside the inspector ShadowRoot.
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
  definitions, displayed next to keys as `key: type`, with values right-aligned.
  Clicking an expandable row title (or using Enter/Space while focused) also
  expands or collapses its children; native tree chevrons remain usable.
  Native tree connector lines show hierarchy, and right padding keeps
  virtual-scrollbar overlays away from value previews.
- Tailwind classes provide static drawer/layout styling; inline styles remain for live width, open/closed transform and Ant Design theme tokens.
- The drawer uses CSS `min-width: min-content` so its minimum automatically follows content changes. Pointer and keyboard resizing cap the requested width to the viewport minus the 32px click-mode tab, but CSS's intrinsic minimum takes precedence when content is wider than the viewport; in that case the drawer may extend beyond the left edge.
- The drawer starts in hover mode, revealing itself when entered and closing after a short leave delay. Its top-right icon switches to click-to-toggle mode: a protruding edge tab then opens or closes the drawer, without mouse-leave closing it. The tab appears only in click mode and can be dragged vertically or moved with Up/Down arrow keys. The tab stays outside the drawer at all normal widths; only a content-driven overflow shifts the open tab onscreen. The closed tab always protrudes from the right edge. Its vertical position stays within the viewport and survives drawer toggles and mode switches until the page reloads. Switching back restores hover behavior.

## Behavior

- `VariableLocation` describes a direct owner/key or the trusted SugarCube
  `State.variables` / `State.temporary` store, with keys checked against the
  installed `StateAPI` type. A single `VariableNode` holds both live location and
  Ant tree state, with lazily loaded `children`; unchanged items are reused by ID.
- `VariableSnapshot` discriminates actual values, accessors, and missing properties.
  Value previews are captured at read time; one `isLeafNode` rule derives
  leaf classification from either a subscribed snapshot or a direct lightweight
  read. Ant Tree retains the corresponding `isLeaf` metadata, and non-enumerable
  properties remain inspectable.
- The drawer shows a loading status until `SugarCube.State` becomes available.
  Inspectors then use the required `getState(): StateAPI` accessor, which throws
  if the runtime unexpectedly loses its State API.
- Components read live SugarCube values directly without serialization or cloning.
  Runtime checks use named `@sindresorhus/is` type guards, including functions
  as expandable references. Boxed primitives are handled explicitly because the
  library's general-purpose type detector rejects them; their values remain inspectable.
- Mounted virtualized rows update values while their variable scope is selected.
  All expanded logical containers watch object identity, structure, array length,
  and Map/Set membership, including while their rows are offscreen.
  Structure snapshots use typed data, accessor, Map, and Set entries; enumerable
  and writable descriptor flags do not trigger tree rebuilds. Structural changes
  rebuild the tree model; ordinary value changes do not.
- The outer Variables tab enables polling, and its selected Story or
  Temporary tab determines the single active scope. Other tabs pause polling;
  returning to a scope immediately refreshes its subscribed snapshots.
  Closing the drawer does not pause polling while a variable scope is selected.
  Ant Tree unmounts offscreen row-value subscriptions; expanded-container
  subscriptions remain until their branches collapse or disappear. A shared
  250ms scheduler checks only active subscriptions.
- References retain object identity; ancestor cycles are marked and stop
  recursive discovery. Ordinary property accessors are displayed without
  invoking them; type classification uses the library defaults.
- Unexpected inspection exceptions propagate unchanged instead of producing
  placeholder error snapshots or silently empty child lists. Such failures may
  interrupt the inspector; node-level error isolation is not currently implemented.
- The virtualized Tree limits mounted rows to the viewport, but Ant still indexes
  discovered logical children. The inspector is read-only.

## Future design note: polling cadence

This is a proposal, not current behavior. The shared `VariableWatcher` still polls
active subscriptions every 250 ms.

- Allow a **configurable fixed interval** (`pollIntervalMs`) when predictable
  polling frequency is preferred.
- Consider an **idle-aware mode** based on `requestIdleCallback` (with a
  timer fallback when unavailable), plus a configurable **maximum poll interval**
  (`maxPollIntervalMs`) to avoid indefinite delays on busy pages. Treat this
  as a best-effort freshness target, not a strict deadline: main-thread work can
  postpone callbacks, and a timeout-triggered poll can still cause frame jank.
- Prevent back-to-back idle callbacks from monopolizing otherwise idle CPU,
  potentially with minimum spacing or a per-cycle work budget. If a full poll
  produces long tasks, consider yielding between batches of watchers.
- Preserve one shared scheduler, no overlapping polling cycles, inactive-scope
  pausing, and immediate catch-up when a scope becomes active again.
- Benchmark game frame times, longest inspector task, CPU load, and update
  latency before replacing the 250 ms default.

## Shadow DOM integration

`entrypoints/content.tsx` mounts React in a manually created ShadowRoot in
Chrome's MAIN world. Ant's `StyleProvider` inserts styles in the ShadowRoot.
A dark and compact `ConfigProvider` directs popups to the inspector container.
Tailwind (including Preflight) and the scoped Tabs flex-height rules are compiled into one stylesheet and mounted only inside that ShadowRoot. The game page receives no CSS reset.

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
