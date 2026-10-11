# SugarCube Inspector: direct MAIN-world proof of concept

This experiment branches from `feat/dual-mode-inspector-poc` but **does not run
its CDP debugger or messaging bridge**. The entire inspector React tree runs in
Chrome's MAIN JavaScript world, next to SugarCube itself.

## What this proves

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
  and inspector edits trigger an immediate check. No per-tile timers.
- Nested lists receive **actual JS references**, not JSON or CDP object IDs.
- Aliases and cycles stay referentially identical; accessors are described
  without invoking their getters.
- A deliberately limited `+1` button mutates a writable numeric property
  **in the game itself**. The proof is observable in both the UI and the page.
- No `browser.scripting.executeScript`, RPC, background inspection service,
  side panel, or debugger attachment occurs during inspection.

## How it works

The inspection logic is split into direct MAIN-world utilities
(`src/inspection/direct.ts`), live location reads/writes
(`variableSlots.ts`), child/structure discovery (`variableStructure.ts`),
and the shared polling scheduler (`variableWatcher.ts`). React's
`VariableTree.tsx` and `VariableTile.tsx` render the recursive tree, with
`useVariableWatch.ts` connecting subscriptions to React.


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
4. Expand any object, then click `+1` next to a writable number. The
   actual game variable changes immediately.
5. Test with `npm run lint && npm run compile && npm test &&
   npm run test:browser`.

This is a **limited writable POC**, not a full variable editor. Invoking
getters, setters, and arbitrary functions is deliberately omitted. Active tiles automatically detect
changes on a shared 250ms polling interval **while visible**. Scrolling a tile
back into view re-reads its current value. Expanded container structures are
observed while their subtree is visible, so scrolling into the tree detects new
or removed entries. Passage navigation, manual refresh, and explicit edits
trigger immediate checks of active subscriptions.
