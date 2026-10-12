# SugarCube Inspector: direct MAIN-world proof of concept

This experiment runs its React tree in Chrome's MAIN world, alongside SugarCube.
It does not attach a debugger or use a cross-world messaging bridge.

## User interface

- **MUI Community** provides the default appearance for Tabs, List, ListItem,
  IconButton, Button, Typography, and Collapse. There are no copied shadcn
  components or Tailwind stylesheets.
- Overview, Variables, and Scripts are top-level tabs. Under Variables are
  Story Variables, Temporary Variables, and Favorites. Overview, Scripts, and
  Favorites are placeholders.
- The variable tree currently uses **MUI List + Collapse**, rather than
  MUI X Tree View. This preserves lazy child mounting, per-node visibility
  subscriptions, and live object inspection. MUI X Community Tree View can
  be evaluated later for dedicated keyboard navigation.
- The remaining layout settings handle drawer geometry, its resize handle,
  and value truncation. Most styling comes from MUI's default dark theme.

## Behavior

- Components read `SugarCube.State.variables` and
  `SugarCube.State.temporary` directly without cloning.
- Independently watched rows update with live values. Expanded objects
  additionally watch structure, array length, and Map/Set membership.
- `react-intersection-observer` tracks visible subtrees. Offscreen tiles stop
  polling. A shared 250ms scheduler checks active subscriptions.
- References retain object identity; cycles are marked and property getters
  are not invoked. Pagination initially shows 100 children per container.
- The inspector is read-only for now.

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
