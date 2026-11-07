# SugarCube Inspector

SugarCube Inspector runs its React variable tree in Chrome's MAIN world, alongside SugarCube.
It reads live story and temporary variables directly without attaching a debugger or using a cross-world messaging bridge.

## User interface

- **Ant Design** provides tabs, labels, buttons, dark/compact theme and the virtualized Tree.
- Theme settings remain independent: `src/theme/antd.ts` configures Ant Design's dark/compact algorithms, while `src/theme/prism.ts` selects Prism's unmodified VS Dark syntax theme. No shared theme provider or colour overrides are introduced.
- **Tailwind CSS v4** provides its complete stylesheet, including Preflight and utilities, inside the inspector ShadowRoot.
- Overview shows the story name, current passage, turn, and up to ten previous
  passages in the current playable history. Under Variables are Story Variables,
  Temporary Variables, and Favorites. Favorites tracks explicitly starred
  variables. Passages lets you search a Twine 2 export by passage title or tag
  and read the source as plain text. Overview links to the current passage source
  when it exists in the export.
- Under Variables, search both scopes by name or path. Search lists up to 20
  results per scope from top-level variables and already discovered branches.
  Selecting a result opens its scope and reveals its row.
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
- The drawer uses CSS `min-width: min-content` so its minimum automatically follows content changes. Pointer and keyboard resizing cap the requested width to the viewport in hover mode or to the viewport minus the 32px tab in click mode, but CSS's intrinsic minimum takes precedence when content is wider than the viewport; in that case the drawer may extend beyond the left edge.
- The drawer starts in hover mode, revealing itself when entered and closing after a short leave delay. Its top-right icon switches to click-to-toggle mode: a protruding edge tab then opens or closes the drawer, without mouse-leave closing it. The tab appears only in click mode and can be dragged vertically or moved with Up/Down arrow keys. The tab stays outside the drawer at all normal widths; only a content-driven overflow shifts the open tab onscreen. The closed tab always protrudes from the right edge. Its vertical position stays within the viewport and survives drawer toggles and mode switches until the page reloads. If the viewport becomes shorter, CSS keeps the tab visible; arrow-key movement clamps the saved position to the current viewport, while dragging starts from the visible position. Switching back restores hover behavior.

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
- Starred property and array locations are tracked by root-relative paths, so favourites
  follow replaced ancestors and retain missing paths. The extension remembers
  string-key paths per story IFID across reloads and new local exports. Symbol-key
  paths and stories without an IFID use session-only favorites. Map/Set entry
  nodes cannot be pinned, but their containing
  variables can. An always-active `favorites` scope polls pinned values, while a
  separate `favorites-tree` scope pauses structural and descendant polling off-tab.
- A favorite's history shows its last 20 observed preview changes with the
  passage and turn sampled at each change. History is kept for the page session.
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
- A favorite that is initially unreadable appears as missing and is retried.
  Polling read failures keep the last readable snapshot.
  Other initial inspection failures can interrupt the affected tree.
- The virtualized Tree limits mounted rows to the viewport, but Ant still indexes
  discovered logical children. Click a writable string, finite number, or
  boolean row to edit it, including ordinary nested properties and array entries.
  Expandable rows still expand or collapse. Save preserves the variable's type.
- Use the lock beside a writable primitive to keep its value for the page
  session. The inspector restores changes on its 250 ms poll, including while
  the drawer is closed. Unlock to edit. If the path disappears, becomes
  read-only, or holds an object, the lock releases.
  If two locked paths come to reference the same property, the earlier lock wins.
  The Locked Variables tab lists active locks from both scopes with their frozen
  values and an unlock control for each path.

## Accepted interaction limitations

- Expandable variable titles have their own keyboard focus target in addition
  to Ant Design Tree's navigation. This adds Tab stops for expandable rows;
  Enter or Space on a focused title expands or collapses that row.

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

For a hosted SugarCube story, open the story in its own tab and click the
extension toolbar icon to activate inspection. The drawer opens when it first
attaches. Use its handle or toggle tab to reopen it in the same document. Click
the toolbar icon again after reloading or navigating to a new document. Hosted
favorites are stored separately for each site origin and story IFID. A site's
content security policy can prevent the drawer's styles from loading.
