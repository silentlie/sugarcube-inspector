# Test coverage review

Reviewed 8 November 2026 against `codex/dev` at
`3eb80f86551ea928c01fc946fc4ee902b4413ce3` and its local changes.
This is a review of behavior and assertions, not an instrumented coverage percentage.

## Result

Core inspection behavior has substantial unit, integration, and Chromium coverage.
The two gaps identified in the review are now covered with small integration tests.
Production behavior and dependencies are unchanged.

### Delayed favorites restoration

[The restoration tests](../src/variables/favoriteStorage.test.ts) call the real
`connectFavoriteStorage` and favorite store, delaying the existing loaded event
until after user activity:

- A newly added pin survives, a removed pin stays absent, and unrelated legacy
  pins merge into both the live store and story metadata.
- A response from before a story-moment change cannot import old pins into the
  current moment.

These tests use happy-dom and controlled SugarCube state. They disconnect the
storage connection and clear the singleton store afterward. No browser timing
or production refactor is needed.

Previously, the browser suite covered ordinary migration, save/load across
exports, and restoration through story history, but did not force these races.

### Background relay handling

[The background tests](background.test.ts) use the existing fake-browser setup:

- A small rejection table checks missing sender tab, subframe sender, missing
  sender URL, wrong message type, invalid payload, and invalid story identifier.
  Invalid input must not query tabs or send messages.
- A valid operation reaches the other tabs even when one recipient rejects it.
  The test also checks sender exclusion, the unchanged operation, and grouping
  derived from the sender URL and IFID rather than a supplied group.

The relay intentionally broadcasts; recipients filter groups. The test does
not impose matching-story filtering on the background worker.

Previously, pure decoder tests and successful browser synchronization did not
exercise listener validation or failed recipients. The existing background
injection tests remain intact.

## Verification

- Before these additions: 107 unit/integration tests in 19 files passed, and all
  59 Chromium browser tests passed, including the production build.
- After these additions: all 116 unit/integration tests in 20 files passed;
  TypeScript compilation and the full lint command passed. Lint reported eight
  existing Tailwind class-order warnings in unchanged UI files.
- The final changed-file lint check and Git whitespace check passed.
- Five temporary mutations demonstrated that the new tests detect removal of
  the removed-pin guard, removal of the story-moment guard, bypassed sender
  validation, bypassed message validation, and replacing `Promise.allSettled`
  with `Promise.all`.
- Every mutation produced the expected test failure and was reverted. No
  production-source mutation is retained.

## Existing coverage to retain

| Area | Existing protection |
| --- | --- |
| Safe live inspection | Own descriptors, getter avoidance, cycles, reference identity, replaced owners, stable IDs, and structural changes in `inspection.test.ts`, `nodes.test.ts`, and `state.test.ts`. |
| Polling and lifecycle | Shared timer, inactive scopes, unreadable-value recovery, sample isolation, virtualization, unsubscribe behavior, and hidden-tree catch-up in unit and browser tests. |
| Editing and history | Stale writes, read-only values, replaced owners, locks, bounded undo/redo, redo-branch discard, moment reset, multiline strings, and focus restoration. |
| Locks | Updating frozen targets, stale locks, changed types, read-only properties, alias convergence, enforcement, and unlock/removal. |
| Comparison | Primitive changes, additions/removals, signed zero, symbols, batch deduplication, bounded history, paused baselines, unpin, and Clear All regressions. |
| Search and passages | Restricted path grammar, case handling, result cap/ranking, collapsed branches, offscreen reveal, passage title/tag/source search, and no source execution. |
| Persistence and synchronization | Reserved-name conflicts, save/load across exports, empty saves, legacy migration, history moments, live pin/unpin synchronization, and foreign-group isolation. |
| Drawer and accessibility | Validated geometry, late preferences, pointer/keyboard operation, inert closed content, viewport constraints, and real CSS layout. |
| Extension integration | MAIN-world mounting, ShadowRoot style isolation, hosted opt-in, document-bound injection, reload behavior, and extension storage. |

## Additional tests deliberately skipped

These are decisions about the current implementation. Revisit them when the
relevant contract changes or a concrete regression exposes a new failure mode.

| Candidate | Reason for skipping |
| --- | --- |
| A test for every component lacking a matching test file | Overview, passages, details, editing, history, and lock panels already have browser assertions on their visible behavior. Test filenames do not measure behavioral coverage. |
| Another primitive-editor happy-path suite | Browser tests already cover numbers, booleans, multiline strings, negative zero, invalid/empty numeric input, cancel, stale drafts, and read-only transitions. Mocked component copies would duplicate protection. |
| More ordinary undo/redo, lock, or comparison examples | Unit tests cover model guards and limits; browser tests verify the controls invoke them. More ordinary values would not establish another invariant. |
| Search-helper tests repeating browser assertions | The browser scenario checks exact-match priority, the 20-result cap, case handling, changed collapsed children, excluded unopened branches, escaped keys, scope switching, and offscreen reveal. Parser syntax already has focused unit tests. |
| A large hosted-navigation race suite | Existing unit assertions require both injections to target the probed document ID; browser tests check hosted opt-in and reload. Mocking Chrome's stale-document rejection would mostly repeat the platform contract. Revisit if retry/fallback logic is added. |
| Separate HTTP/HTTPS/file synchronization browser matrices | Group construction has unit coverage, while real file-export synchronization and foreign-group rejection have browser coverage. The new relay test also checks hosted-origin group derivation. |
| Dependency internals or broad snapshots | Ant Design, React, and Prism internals are outside this extension's contract. Existing tests check keyboard behavior, token colors, connectors, and actual geometry; broad snapshots add maintenance churn. |
| More arbitrary large-tree sizes or timing benchmarks | The 10,000-child test checks reachability without mounting offscreen rows; other cases check offscreen updates. More sizes or machine-speed assertions need a concrete performance requirement. |
| A test for the local `valueSyntax.tsx` import reorder | It changes no runtime behavior. Existing syntax tests and the successful build exercise the module. |
| A new coverage provider or percentage threshold | A percentage would not prove that restoration races or message boundaries are protected. No threshold was requested, and the focused tests require no dependency. |
| Firefox/WebKit/Safari matrix expansion | The documented product and CI target Chromium. Firefox build scripts alone do not establish a supported cross-browser behavior contract. |

The local browser additions reviewed before this work are worth retaining:
empty numeric input must not silently save zero, and awaiting a foreign-group
message while pins exist gives the isolation assertion a meaningful
synchronization point.

## Limits

GitNexus's index was 46 commits behind the reviewed HEAD, so current source and
reference searches supplied the evidence. No graph refresh or coverage
instrumentation was added. The original Chromium run predates these test-only
and documentation changes; its assertions were not changed by this work.
