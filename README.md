# SugarCube Inspector: direct MAIN-world proof of concept

This experiment runs its React tree in Chrome's MAIN world, alongside SugarCube.
It does not attach a debugger or use a cross-world messaging bridge.

## User interface

- **MUI Community** provides Tabs, Typography, Buttons, and **MUI X RichTreeView**
  with accessible keyboard navigation. There are no Tailwind, shadcn, or Pro dependencies.
- Overview, Variables, and Scripts are top-level tabs. Under Variables are
  Story Variables, Temporary Variables, and Favorites. Overview, Scripts, and
  Favorites are placeholders.
- The variable tree uses **MUI X Community RichTreeView + custom TreeItem**.
  `getItemChildren` eagerly discovers the supplied tree hierarchy, without
  copying game values. Pages of 100 children limit how many nodes MUI indexes
  initially; “Load more” extends a specific branch.
- The remaining layout settings handle drawer geometry, its resize handle,
  and value truncation. Most styling comes from MUI's default dark theme.

## Behavior

- `VariableLocation` describes a direct owner/key or the trusted SugarCube
  `State.variables` / `State.temporary` store, with keys checked against the
  installed `StateAPI` type. Tree node models have no stored `children` arrays.
- Components read live SugarCube values directly without serialization or cloning.
- Independently watched rows update values while in view. Expanded, visible
  containers additionally watch structure, array length, and Map/Set membership.
  Structural changes rebuild the tree model; ordinary value changes do not.
- `react-intersection-observer` tracks visible rows. Offscreen rows stop
  polling. A shared 250ms scheduler checks active subscriptions.
- References retain object identity; ancestor cycles are marked and stop
  recursive discovery. Arbitrary property getters are not invoked. The
  `getItemChildren` adapter limits initial indexing to 100 children per parent.
- This Community Tree View is not virtualized. The inspector is read-only.

## Shadow DOM integration

`entrypoints/content.tsx` mounts React in a manually created ShadowRoot in
Chrome's MAIN world. An Emotion cache inserts MUI-generated styles inside
the ShadowRoot. A dark `ThemeProvider` routes modal and popup portals to
the inspector's container. `ScopedCssBaseline` keeps MUI's baseline styles
within the inspector instead of modifying the game's page.

Shadow DOM isolates appearance but not JavaScript. A hostile or broken game
can affect the inspector, and vice versa. Do not run on untrusted pages.

## Try it

1. Run `npm ci && npm run build`.
2. Load `.output/chrome-mv3` in `chrome://extensions` and allow local file access.
3. Open a SugarCube HTML game, reveal the drawer, and select
   Variables → Story Variables or Temporary Variables.
4. Expand objects and change game values. Visible entries update automatically.
5. Run `npm run lint && npm run compile && npm test && npm run test:browser`.
