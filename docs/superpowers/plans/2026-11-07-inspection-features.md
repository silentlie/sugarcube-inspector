# Inspection Features Implementation Plan

> Execute inline, with an independent reviewer for each feature as requested by the user.

**Goal:** Implement the accepted five features on `codex/dev`, reviewing and committing each before proceeding.
**Architecture:** Reuse safe property-path reads, existing editor/lock stores, passage search, shared watchers, and the isolated extension bridge. No new dependencies.
**Spec:** The accepted proposal in this chat, amended to use extension storage for drawer preferences, visible back/forward edit buttons, and omit feature 6.

## Constraints and decisions

- Preserve unrelated `valueSyntax.tsx` and `.serena/` changes.
- Strings, finite numbers, and booleans only; no expression execution or complex-value editing.
- Comparison is explicit capture/compare, session-only, covering top-level values in both scopes and the favorite paths selected at capture.
- Passage references are literal text matches, not semantic read/write analysis.
- Drawer settings are extension-wide in `browser.storage.local`, separate from story favorites. Save width, mode, and tab position; do not persist whether the drawer is currently open.
- Undo/redo keeps at most 20 successful edits in the current story moment and retains conflict/lock guards.
- Each task: write a focused failing regression, implement, verify, independently review/fix/re-review until clear, then commit source/tests/docs together.

## Task 1: Variable comparison

Files: new `src/variables/comparison.ts` and `.test.ts`, new `ui/VariableComparison.tsx`, `DirectInspector.tsx`, browser regression, README.
- [x] Capture safe primitive snapshots; compare additions/removals/value and type changes without getters or hidden settings.
- [x] Add Capture Baseline and Show Changes, before/after display, and Reveal via existing tree navigation. Missing paths report an error without writes.
- [x] Test both roots, pinned nested paths, replaced owners, missing/complex values, hidden metadata, and getter avoidance. Verify Chromium navigation and unchanged game values.
- [x] Review and commit.

Task 1 verified: compile, 3 comparison unit tests, 83-unit suite before symbol fix, rebuilt Chromium comparison regression, scoped lint. Independent review found symbol favorites were omitted; fixed with identity-aware keys and re-reviewed clear. Session-only comparison includes existing symbol favorites.

## Task 2: Find passage references

Files: `VariableDetails.tsx`, `VariableTree.tsx`, `DirectInspector.tsx`, `StoryPassages.tsx`, browser regression, README.
- [ ] Route Find in Passages from details to the existing source picker using the formatted property path and existing focus request.
- [ ] Verify source-only matches appear without evaluating macros; keep manual searches and source selection working.
- [ ] Review and commit.

## Task 3: Edit locked values

Files: `locks.ts`, `PrimitiveVariableEditor.tsx`, `VariableNodeContent.tsx`, `LockedVariables.tsx`, focused tests/browser, README.
- [ ] Add guarded update of a lock's live primitive and frozen target, retaining its identity and lock state.
- [ ] Reuse primitive editor for locked tree tiles and Locked Variables list; reject stale/missing/read-only/type-changed targets and alias conflicts.
- [ ] Verify subsequent game writes are restored to the new frozen value; ordinary edit and unlock behavior remains correct.
- [ ] Review and commit.

## Task 4: Persist drawer preferences in extension storage

Files: new drawer preference message/validation module, existing isolated content bridge, `Drawer.tsx`, relevant tests/browser, README.
- [ ] Read/write one extension-wide preferences object. Validate bridge payloads; throttle writes by committing final drag/resize positions rather than every movement.
- [ ] Apply asynchronously loaded settings without overriding newer local interaction. Clamp geometry to the viewport using existing drawer rules.
- [ ] Test mode/width/tab-position reload persistence, invalid data fallback, hosted activation, and separation from story settings.
- [ ] Review and commit.

## Task 5: Bounded edit history with back/forward controls

Files: `edits.ts`, new `.test.ts`, `UndoEdit.tsx`, affected browser expectations, README.
- [ ] Replace one edit with bounded undo/redo stacks; new edits discard redo. Back/forward buttons have accessible Undo/Redo labels and path titles.
- [ ] Clear on passage/moment change; keep owner/current-value/writable/lock guards and isolate stale edits. Locked-target updates remain outside ordinary undo unless explicitly integrated safely.
- [ ] Test multi-step undo/redo, capacity, branch edits, no-ops, moment change and conflicting game writes; verify real browser buttons.
- [ ] Review and commit.

## Final verification

- [ ] `npm run compile`, `npm test`, `npm run lint`, and `npm run test:browser` pass (existing lint warnings reported).
- [ ] Confirm meaningful changes committed and unrelated local work preserved. Report decisions, review results, checks, and limitations.
