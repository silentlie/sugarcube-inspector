# Running the tests

Run unit, startup, and RPC integration tests with `npm test`. Use
`npm run test:watch` while developing. RPC integration tests use the actual
`@webext-core/messaging` transport and the page bridge entrypoint; the SugarCube
runtime is a small fixture in these tests.

Run `npm run compile` to check TypeScript, including both test suites.

## Inspector UI coverage

Component tests exercise the loading, ready, refreshing, and error screens,
disabled controls, and recovery through Retry. Scope-tab tests check selection,
panel associations, keyboard focus and wrapping, unique IDs, and independent
tree expansion state across tab switches and fresh snapshots.

Variable-tree tests cover nested arrays and objects, Maps and Sets, empty
containers, circular and shared references, literal property paths, and retained
expansion after snapshot updates. Value helpers also cover sparse array indices,
named properties, type labels, special numeric values, and preview tooltips.

## Live watch coverage

- `src/sugarcube/watchService.test.ts`: incremental value patches, structural
  discovery, nested additions/removals, generation mismatches, missing-path
  restoration, watched aliases and circular values, array lengths, and Map/Set
  handling.
- `src/sugarcube/applyWatchPatches.test.ts`: in-place mutation, sparse arrays,
  special property names, and explicit nonconfigurable-property failures.
- `src/inspector/watch/VariableStore.test.ts`: path-version notifications
  and updates to shared aliases without unnecessary root/sibling notifications.
- `src/inspector/watch/WatchProvider.test.tsx`: independent visible/favorite
  registrations, missing-favorite removal, 250 ms polling, recovery,
  unconditional active-scope root watching, and immediate polling when
  expanding visible containers.

**Active-root watch contract:** Every active poll includes the selected
scope's root as a structure-only target, even if no variable rows are visible,
all containers are collapsed, or the scope is empty. This checks for top-level
additions and removals without deep-comparing root values. Structure checks
implied by visible child rows are deduplicated with the explicit root check.
Polling pauses while the page is hidden. See
[visible structure watching](../docs/visible-structure-watching.md).


## Browser smoke tests

Install the browser once:

```sh
npx playwright install chromium --no-shell
```

Then run:

```sh
npm run test:browser
```

The command builds the Chrome MV3 extension, generates a local story with the
official SugarCube 2.37.3 runtime, and tests the unpacked extension in Playwright's
Chromium. The format is downloaded from the pinned upstream tag on the first run,
verified against a SHA-256 checksum, and cached in `tests/browser/.cache`.
Subsequent runs use the verified cache without a network request.

Each browser test uses a temporary profile and closes its browser context in
`finally`. The tests check the initial snapshot, automatic story and temporary
variable updates after a real passage change, and five consecutive reloads with
one inspector and a working manual refresh. They also exercise keyboard scope
navigation, independent tree expansion across refreshes and passage changes,
live polling of a visible scalar without a passage change, and recovery through
Retry after the real bridge rejects uncloneable data.
Generated stories and browser results are ignored by Git. Failed runs retain
Playwright traces under `test-results`.

The browser tests use native page and extension script contexts. They cover the
supported local-file story flow. Startup tests also establish that failed or
timed-out readiness prevents UI mounting; startup currently performs one
readiness request and has no automatic reconnect.

Upstream references: [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)
and [SugarCube 2](https://www.motoslave.net/sugarcube/2/).

## GitHub Actions

The [CI workflow](../.github/workflows/ci.yml) runs on pushes to `main`, pull
requests targeting `main`, and manual runs from the Actions tab. It uses Node.js
24 on Ubuntu 24.04 and installs the locked dependencies with `npm ci`.

Each run checks ESLint and TypeScript, runs the unit and RPC integration
tests, installs Playwright's Chromium and its Linux dependencies, then builds
the extension and runs the browser smoke tests. Superseded runs on the same branch are cancelled.
Failed browser runs upload `test-results` as the `browser-test-results` artifact
and retain it for seven days. Download the artifact and open a trace with
`npx playwright show-trace path/to/trace.zip` to inspect the failure.
