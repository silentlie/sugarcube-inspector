# SugarCube Inspector: DevTools proof of concept

A Chromium DevTools extension for inspecting live SugarCube game variables.
This branch is independent of PR #3's CDP side-panel prototype and main's
snapshot inspector.

## Where to find the variables

Open Chrome DevTools on a SugarCube story and select the **SugarCube** tab.
The tab now displays two live, expandable trees directly underneath Refresh:

- **Story variables ($)** — `SugarCube.State.variables`
- **Temporary variables (_)** — `SugarCube.State.temporary`

Expand any object to inspect its own properties. The tree requests just one
level at a time through `devtools.inspectedWindow.eval()`; it doesn't copy
the entire graph, attach Chrome's debugger, or inject a page script. Refresh
re-reads both stores from the game and clears previously expanded nodes.
Large collections support **Load more**.

The **Elements** panel also retains **SugarCube Story** and
**SugarCube Temporary** native sidebars for full-fidelity debugging. Chrome
does not offer a way to embed those native object viewers into a custom
DevTools panel, so the new in-tab tree is a lightweight descriptor-based viewer.
It displays functions and accessors without invoking ordinary property
getters. Private class fields, internal slots, exotic built-ins and proxy traps
still require the native Elements sidebar.

There is no snapshot fallback, page drawer, extension side panel,
`chrome.debugger` permission, or debugger security banner. Ordinary DevTools
Console operations can edit game variables directly.

## Install and run

With Node.js 24:

```sh
npm ci
npm run build
```

Load `.output/chrome-mv3` via `chrome://extensions` > Developer mode >
Load unpacked. Enable **Allow access to file URLs** in the extension details.

Open the local SugarCube HTML game, press **F12**, and select **SugarCube**.
Expand variables directly in that panel. Change `SugarCube.State.variables.day`
in the normal Console, return to SugarCube, and click **Refresh variables**.

## Tests and scope

Run `npm run lint`, `npm run compile`, `npm test`, and
`npm run test:browser`. Unit tests cover lazy page inspection, accessor
safety, cycles, Maps/Sets, pagination, variable tree UI and Refresh.
The Chromium smoke tests cover packaging, not the real custom DevTools tab,
which still needs manual validation.

This is a read-only proof of concept: custom variable editing, watches,
persistent expansion, and breakpoints are not implemented.
