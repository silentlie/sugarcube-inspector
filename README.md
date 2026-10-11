# SugarCube Inspector: CDP prototype

A Chromium extension for inspecting **live** SugarCube variables using the Chrome DevTools Protocol (CDP).

This branch is an alternative to PR #2's snapshot synchronization system. The
extension does **not** inject a page drawer, copy the variable graph, or fall
back to a snapshot inspector.

## Behavior

The extension icon opens a side panel. The variable inspector is **not mounted**
until you click **Connect** and the background debugger successfully attaches
to the active local SugarCube tab.

With an active session, expand `story` and `temporary` to fetch JavaScript
property descriptors on demand. Chrome's Runtime API supplies values and remote
object handles, including functions, getters, setters, non-enumerable properties,
and supported internal/private properties.

**Disconnect** immediately unmounts the variable tree and detaches Chrome's
debugger. You can then open normal DevTools. After closing DevTools, **Connect**
starts a new inspection session, with fresh object handles and expansion state.
An unexpected debugger detach or navigation also unmounts the inspector.

This is currently a read-only proof of concept. Editing, automatic watches,
breakpoints, and persisted favorites are not implemented.

## Install and try

With Node.js 24 and npm:

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` through `chrome://extensions` > Developer mode >
Load unpacked, and enable **Allow access to file URLs** in its details.

Open a local SugarCube HTML story, click the extension icon, and click
**Connect**. Chrome displays a debugger warning while inspection is active.

See [CDP proof-of-concept guide](docs/cdp-proof-of-concept.md) for the
manual connect/disconnect workflow.

## Development

```sh
npm run lint
npm run compile
npm test
npm run test:browser
```

The browser smoke test builds the extension and checks that the game loads
without any injected inspector drawer. Unit tests exercise the debugger
connection lifecycle and side-panel mounting/unmounting. Real CDP attachment
and DevTools takeover require additional manual validation.

This experimental branch remains separate from the existing main-branch
snapshot inspector.
