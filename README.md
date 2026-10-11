# SugarCube Inspector: dual-mode proof of concept

An on-page **SugarCube Inspector** drawer with two interchangeable live-inspection
backends. This experimental branch is based on `main` and does not alter the
existing snapshot, CDP-only, or DevTools-only draft PRs.

## Modes

- **MAIN world (default):** Inspect live SugarCube values using
  `browser.scripting.executeScript({ world: "MAIN" })`. Descriptors are read
  one level at a time and only small, JSON-compatible property summaries cross
  extension messaging. Functions and accessors are labelled without invoking
  ordinary getters. There is no whole-state snapshot or RPC cloning bridge.
- **Debugger (opt-in session):** The **extension side panel** provides
  **Connect debugger** / **Disconnect debugger**. While attached, the **same
  on-page drawer** uses CDP `Runtime.evaluate` / `Runtime.getProperties`,
  including remote object handles and private/internal property descriptions.
  Returning to MAIN mode unmounts the CDP tree, invalidates old handles, and
  reloads the live values from JavaScript.

The drawer remains on the right edge of the game page in both modes.
The side panel is only a backend controller. No custom DevTools tab is
registered and neither backend transfers complete SugarCube objects.

## Permissions and security

Chrome requires `debugger` permission to be **declared at install time**;
Chrome does not allow it as an optional runtime permission. We still attach
only after you click **Connect debugger**. Chrome shows its security banner
while attached, and dismissing the banner disconnects the session. The drawer
automatically returns to MAIN-world inspection when CDP detaches.

Full Chrome DevTools and extension CDP sessions may conflict. Disconnect in
the side panel if you want to use DevTools normally. Do not suppress the
debugging warning in a regular browser profile.

## Try it

1. With Node.js 24, run `npm ci && npm run build`.
2. Load `.output/chrome-mv3` as an unpacked extension and enable access to
   file URLs in its Details page.
3. Open a local SugarCube HTML game. Hover over the right edge to reveal the
   inspector. The default label is **MAIN world**.
4. Expand the story/temporary trees and click **Refresh variables** to obtain
   new values. The current tree is read-only; it never writes to the game.
5. Click the extension icon to open its side panel, then **Connect debugger**.
   The same drawer changes its label to **Debugger (CDP)**.
6. Expand objects in debugger mode. Click **Disconnect debugger**, or allow
   Chrome to detach the session, to return to MAIN-world inspection.

## Scope

Read-only dual-mode proof of concept. No editor, automatic watches, or
persistent expansion state yet. Proxies can execute traps during reflection.
CDP object handles expire when the session ends, the inspected context
changes, or the tree is refreshed.

Run `npm run lint`, `npm run compile`, `npm test`, and
`npm run test:browser`. Browser CI exercises MAIN-world inspection. Manual
Chrome testing is still needed for CDP attachment and DevTools coexistence.
