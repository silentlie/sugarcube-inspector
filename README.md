# SugarCube Inspector

A Chromium extension for inspecting local Twine stories that use SugarCube.
An injected drawer displays the current story and temporary variables, and a
browser side panel reports the active story's identity and current passage.

The extension uses WXT, React, TypeScript, Tailwind CSS, and a typed custom-event
RPC bridge between the page's SugarCube runtime and the inspector.

## Features

- Expandable trees for story variables (`$`) and temporary variables (`_`).
- Automatic snapshot refresh after SugarCube passage changes, plus a manual
  **Refresh** button.
- Live polling of visible variable rows and favorited paths, with batched,
  incremental updates.
- A drawer that opens on hover, supports resizing by dragging its edge, and has
  keyboard controls.
- Snapshot validation, request timeouts, and a **Retry** button for snapshot
  errors.
- A side panel showing SugarCube detection status, story name, current passage,
  and IFID when available.

## Build and install

Use Node.js 24 and npm to match the CI environment. Run these commands from the
repository root:

```sh
npm ci
npm run build
```

`npm ci` also runs WXT's preparation step, which generates the TypeScript
configuration under `.wxt`. The build creates a Chrome Manifest V3 extension
under `.output/chrome-mv3`.

To load it in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose `.output/chrome-mv3`.
3. Open **Details** for SugarCube Inspector and enable
   [**Allow access to file URLs**](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions#allow-access).
4. Open or reload a local SugarCube story's HTML file in Chrome.

See [Chrome's unpacked extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
for the browser's installation steps. After rebuilding, reload the extension
from `chrome://extensions` and reload the story tab.

## Using the inspector

Move the pointer to the narrow handle at the right edge of the story page to
open the drawer. Drag the handle to adjust its width. With the handle focused,
**Enter** or **Space** toggles the drawer, and **Left Arrow** or **Right Arrow**
adjusts its width.

Expand the variable trees to inspect values. Circular references appear as
links to their ancestor nodes; selecting a link scrolls to and focuses that
ancestor instead of rendering the same object again. Visible and favorited
variables update through polling without a passage change. Passage changes
also trigger a fresh full snapshot; use **Refresh** when you need all values,
including unwatched or collapsed ones, to be recaptured. If a snapshot
request fails, the drawer shows the error and a **Retry** button.

Variable watches use separate favorite and visible lists. The visible list
contains scalar/opaque leaves and expanded containers only; collapsed
containers are absent unless explicitly favorited. Watches poll every 250 ms
and pause while the page is hidden. Expanded visible containers are compared
as a whole and cloned only when changed. Expanding a visible container
triggers an immediate poll. Empty objects, arrays, Maps, and Sets can expand.

On every active poll, the selected variable scope's root is checked for
**top-level additions and removals**, even when all variable rows are offscreen
or collapsed. This is a shallow scan of root property names, not a deep
comparison of root values. MAIN deduplicates root checks inferred from other
visible rows. Parents of nested visible rows are also checked for added/removed
children. Polling still pauses when the page is hidden.

Favorites remain value-watched when hidden; missing favorites retain read-only
placeholders. MAIN and the inspector each maintain a mutable synchronized
variable graph. Poll responses contain path-based patches that update both
graphs. Unwatching does not discard already synchronized state; only a fresh
full snapshot replaces the baseline. Independent watched aliases may diverge,
then catch up when watched again or refreshed.
See [visible structure watching](docs/visible-structure-watching.md).
Watch-performance notifications are deferred pending a redesign; see
[deferred watch-performance notifications](docs/deferred-watch-performance-notices.md).
Favorites currently last for the lifetime of the inspector.

Select the extension's toolbar icon to open the side panel. Its **Refresh**
button checks the currently active tab for a local SugarCube story and updates
the displayed metadata.

## Development commands

| Command                | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Start WXT development mode for Chrome.                         |
| `npm run build`        | Build the production Chrome MV3 extension.                     |
| `npm run zip`          | Package the Chrome extension as a ZIP under `.output`.         |
| `npm run compile`      | Check TypeScript with TypeScript 7, including the test suites. |
| `npm test`             | Run unit, startup, and RPC integration tests.                  |
| `npm run test:watch`   | Run Vitest in watch mode.                                      |
| `npm run test:browser` | Build the extension and run Chromium smoke tests.              |

The normal `tsc` command and CI use TypeScript 7. The `typescript` dependency
aliases the TypeScript 6 compatibility package for tools that need its compiler
API, including `typescript-eslint`; `@typescript/native` supplies TypeScript 7's
`tsc`. This follows
[Microsoft's side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).
Use `npx tsc --version` and `npx tsc6 --version` to check each compiler, or
`npx tsc6 --noEmit` to check the project explicitly with TypeScript 6.

The package also provides `npm run dev:firefox`, `npm run build:firefox`, and
`npm run zip:firefox`. Runtime support and automated browser coverage currently
target Chromium; Firefox support has not been validated.

## Testing

Before the first browser test run, install Playwright's bundled Chromium:

```sh
npx playwright install chromium --no-shell
```

On Linux, install its system dependencies as well:

```sh
npx playwright install --with-deps chromium --no-shell
```

Then run the checks:

```sh
npm run compile
npm test
npm run test:browser
```

Unit and startup tests cover snapshot validation, timeout handling, inspector
state transitions, bridge readiness, and cleanup. Watch-service and component
tests cover structural discovery, missing/favorite paths, cycles and aliases,
snapshot generations, patch application, and path-local notifications. RPC
integration tests use the production page bridge and actual custom-event
transport with a small SugarCube fixture.

Browser smoke tests load the built extension with a real SugarCube 2.37.3 story
and check initial variables, live polling updates without passage navigation,
updates after passage navigation, repeated reloads, and manual refresh. The pinned story format is downloaded on the first run,
verified against a SHA-256 checksum, and cached for subsequent runs.

See [the testing guide](tests/README.md) for fixture details and Playwright trace
instructions.

## Continuous integration

The [GitHub Actions workflow](.github/workflows/ci.yml) runs on pushes to `main`,
pull requests targeting `main`, and manual runs. It uses Ubuntu 24.04 and Node.js
24, installs locked dependencies, runs ESLint and TypeScript checks, runs the
unit and integration tests, then builds the extension and runs Chromium smoke tests.

Superseded runs on the same branch are cancelled. Failed browser runs upload
`test-results` as a `browser-test-results` artifact retained for seven days.
View results in [GitHub Actions](https://github.com/silentlie/sugarcube-inspector/actions).

## How the bridge works

The page bridge runs in the browser's `MAIN` world, where it can read SugarCube.
The inspector runs in an isolated content-script context and mounts its React
drawer in a shadow root. The two scripts communicate through
`@webext-core/messaging/page` using the `sugarcube-inspector:rpc:v1` namespace.

```mermaid
sequenceDiagram
    participant Story as SugarCube runtime
    participant Bridge as MAIN WatchService
    participant Inspector as Inspector WatchProvider
    Inspector->>Bridge: bridgeReady
    Bridge-->>Inspector: true after initialization
    Inspector->>Bridge: getSnapshot
    Bridge->>Bridge: Clone live snapshot and start generation
    Bridge-->>Inspector: Full snapshot + generation
    Note over Inspector: Validate snapshot; create VariableStore
    loop Every 250 ms while document is visible
        Inspector->>Bridge: getWatchChanges(generation, favorites, visible)
        Bridge->>Story: Compare registered values and structures
        Bridge->>Bridge: Clone changes; apply patches to MAIN copy
        Bridge-->>Inspector: Patches + generation + mainDurationMs
        Inspector->>Inspector: Mutate local copy; notify affected paths
    end
    Story->>Bridge: passageend event
    Bridge->>Inspector: passageChanged
    Inspector->>Bridge: getSnapshot
    Bridge-->>Inspector: Fresh full snapshot + new generation
    Note over Inspector: Poll failure/mismatch also triggers resync
```

The bridge registers its readiness handler after successful initialization.
Readiness, snapshot, and watch-poll requests use a three-second timeout.
The inspector validates full snapshots with Zod and ignores superseded
snapshots or results received after unmounting. Watch polls do not overlap,
pause when the page is hidden, and trigger full-snapshot recovery on failure
or generation mismatch.

## Watch performance experiments

Experimental code compares custom deep-equality traversal and reference
tracking, plus compare-before-clone, clone-before-compare, and always-clone
strategies. Production already uses compare-before-clone with
`fast-equals/deepEqual` and a circular-data fallback; the experimental
comparators and pollers are not wired into production WatchService.
See [watch polling benchmarks](docs/watch-polling-benchmarks.md) for results,
including measurements of real Chromium MAIN-to-isolated-world
`@webext-core/messaging/page` transport.

Install benchmark-only dependencies without changing the project lockfile:

```sh
npm ci
npm install --no-save --package-lock=false --ignore-scripts fast-equals@6.1.1 fast-deep-equal@3.1.3 dequal@2.0.3 esbuild@0.28.2
npx playwright install chromium
npm run bench:watch:equality -- equality.json
npm run bench:watch:variants -- worker.json
npm run bench:watch:chromium -- chromium.json
```

The equality and worker-thread measurements run in Node.js; the Chromium script
bundles the project's actual custom-event RPC into two Chrome execution worlds
with synthetic watched values. Results, assumptions and correctness limitations
are recorded in [the benchmark notes](docs/watch-polling-benchmarks.md).

## Project structure

| Path | Responsibility |
| --- | --- |
| `entrypoints/content.tsx` | Verify bridge readiness and mount the inspector drawer. |
| `entrypoints/sugarcube.content.ts` | MAIN-world bridge: snapshots, watch polling, and passage-change messages. |
| `entrypoints/background.ts` | Open the extension side panel from the toolbar. |
| `entrypoints/sidepanel/` | Detect the active local story and display metadata. |
| `src/inspector/variable-tree/` | Render variable nodes, expand/collapse, favorites, and circular navigation. |
| `src/inspector/watch/` | Poll scheduling, visibility/favorites, mutable store, and path subscriptions. |
| `src/sugarcube/watchService.ts` | Compare live values and structures to MAIN's synchronized baseline. |
| `src/sugarcube/applyWatchPatches.ts` | Shared in-place patch application in MAIN and inspector. |
| `src/sugarcube/watch.ts` | Watch targets, paths, patches, and ancestor pruning. |
| `src/sugarcube/watchEqual.ts`, `watchPollingVariants.ts` | **Experimental only** equality/polling alternatives. |
| `src/sugarcube/types.ts` | Snapshot validation schema. |
| `tests/` and colocated `*.test.ts(x)` | Browser, bridge, startup, watch, and component tests. |
| `docs/` | Implemented watch architecture, deferred designs, and historical benchmark evidence. |

## Current scope and limitations

- Content scripts match local `file://` pages. The drawer requires
  `tw-storydata[format="SugarCube"]`; HTTP/HTTPS stories and other Twine formats
  are outside the current scope.
- The page bridge requires the story's SugarCube and jQuery runtimes to be
  available when it initializes. Startup makes one readiness request and does
  not reconnect automatically. If startup fails, check the page's developer
  console and reload the story to retry.
- The side panel checks metadata on initial load or manual refresh. It does not
  automatically follow tab switches or passage changes. Window-aware tab
  synchronization is documented in the
  [deferred side-panel design](docs/deferred-side-panel-tab-sync.md).
