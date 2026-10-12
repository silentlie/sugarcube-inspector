# SugarCube Inspector: direct MAIN-world proof of concept

This experiment branches from `feat/dual-mode-inspector-poc` but **does not run
its CDP debugger or messaging bridge**. The entire inspector React tree runs in
Chrome's MAIN JavaScript world, next to SugarCube itself.

## What this proves

- shadcn/ui Tabs provides accessible Overview, Favorites, and Scripts sections;
  only Overview contains live variables for now. Story/Temporary selection also
  uses the default shadcn Tabs styling, with no per-instance style classes.

- React components call `SugarCube.State.variables` and
  `SugarCube.State.temporary` directly, holding the original objects.
- A recursive VariableTree renders independently subscribed VariableTiles. Each
  tile reads its current live slot, not a stale value captured by its parent.
- Expanded objects additionally watch property structure and Map/Set membership;
  object replacement, in-place changes and array length updates are supported.
- The `useInView` hook from `react-intersection-observer` tracks whether a
  tile's subtree intersects the viewport. Matching observers are shared. Offscreen tiles stop polling, including while the drawer is
  closed; visible ancestors stay active to detect object replacement.
- One shared 250ms scheduler polls only active subscriptions. Passage changes
  and manual refresh trigger immediate checks. No per-tile timers.
- Nested lists receive **actual JS references**, not JSON or CDP object IDs.
- Aliases and cycles stay referentially identical; accessors are described
  without invoking their getters.
- No `browser.scripting.executeScript`, RPC, background inspection service,
  side panel, or debugger attachment occurs during inspection.

## How it works

The inspection logic is split into direct MAIN-world utilities
(`src/inspection/direct.ts`), live location reads
(`variableSlots.ts`), child/structure discovery (`variableStructure.ts`),
and the shared polling scheduler (`variableWatcher.ts`). React's
`VariableTree.tsx` and `VariableTile.tsx` render the recursive tree, with
`useVariableWatch.ts` connecting subscriptions to React.


shadcn/ui component source is stored in `src/components/ui/` and configured
using `components.json`. Its default dark-theme variables are defined once in
the ShadowRoot stylesheet, so tab consumers need no CSS or style props.

To add further shadcn/ui components, run `npx shadcn@latest add <component>`.

`entrypoints/content.tsx` has `world: "MAIN"`. Because MAIN-world scripts do
not receive WXT's usual content-script context, it creates a ShadowRoot
directly, inlines compiled CSS, and mounts React into it.

The drawer is isolated visually with Shadow DOM, **not** in JavaScript.
The game and inspector now share a JS realm. A hostile or buggy game can
interfere with the inspector, and inspector code can affect the game.
Do not use this POC on untrusted pages.

## Try it

1. Run `npm ci && npm run build`.
2. Load `.output/chrome-mv3` in `chrome://extensions` and allow access to
   local file URLs.
3. Open a SugarCube HTML game and reveal the right-edge drawer.
4. Expand any object to inspect its live properties. Variable changes made
   by the game appear automatically while visible.
5. Test with `npm run lint && npm run compile && npm test &&
   npm run test:browser`.

This proof of concept is read-only. Getter and setter invocation and
arbitrary function calls are deliberately omitted. Active tiles automatically
detect changes on a shared 250ms polling interval **while visible**. Scrolling
a tile back into view re-reads its current value. Expanded container structures
are observed while their subtree is visible, so scrolling into the tree
detects new or removed entries. Passage navigation and manual refresh
trigger immediate checks of active subscriptions.
