# SugarCube Inspector: DevTools extension proof of concept

Experimental Chromium extension that inspects SugarCube story and temporary
variables using **Chrome DevTools' native JavaScript object viewer**, rather
than copying live objects through RPC or attaching through `chrome.debugger`.

This prototype is developed separately from both the snapshot inspector on
`main` and the CDP side-panel proof of concept in PR #3.

## How it works

Opening DevTools creates a **SugarCube** panel with a status check and
**Refresh variables** button. In the standard **Elements** panel's sidebar,
the extension provides two native property viewers:

- **SugarCube Story:** `SugarCube.State.variables` (`$` variables).
- **SugarCube Temporary:** `SugarCube.State.temporary` (`_` variables).

Chrome's native object viewer handles functions, accessor descriptors, object
identity, Map/Set values, and other JavaScript types. The extension only passes
expressions to DevTools, never cloned variable graphs. Sidebars refresh on
selection, navigation, or a manual click in the SugarCube dashboard.

There is **no injected page drawer, extension side panel, snapshot fallback,
debugger permission, or extension debugger warning**. The inspector is available
only while DevTools is open. The native object tree lives in the Elements sidebar,
not directly in the custom SugarCube dashboard tab.

## Install

Using Node.js 24:

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` from `chrome://extensions` > Developer mode >
Load unpacked. In Details, enable **Allow access to file URLs**, then open a
local SugarCube HTML story and launch DevTools (F12).

Select **SugarCube** to see detection and refresh controls. Then open
**Elements**, and find **SugarCube Story** or **SugarCube Temporary** among its
sidebar tabs. Expand objects in the native view and use the regular DevTools
Console to edit live variables; click **Refresh variables** or revisit a
sidebar to fetch the current roots.

## Scope

This is a read-only integration prototype: no custom variable editor, favorites,
automatic watches, or breakpoints. Browser smoke tests confirm packaging and
non-injection; native sidebar behavior must be verified with actual Chrome
DevTools during manual testing.

Run `npm run lint`, `npm run compile`, `npm test`, and
`npm run test:browser` for automated checks.
