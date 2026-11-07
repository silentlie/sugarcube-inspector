# Polled Comparison and Editing Plan

**Goal:** Execute the user's amended feature list on `codex/dev`, reviewing each deliverable independently until clear and committing it before starting the next.
**Spec:** Latest chat request: automatic comparison of polling variables, no container selection, larger string editor, visible edit history; omit report export.
**Workflow:** Superpowers, with minimal implementation and existing dependencies. User authorizes routine design decisions and execution without further approval.

## Decisions and constraints

- Features 1 and 3 share the same amended behavior and form one automatic polling-comparison deliverable.
- Replace manual Capture/Show Changes with the latest 100 observed primitive transitions, including additions/removals, passage/turn context, Clear Changes and Reveal.
- Sample existing active root/expanded-container watches and independent favorite watches; no extra scheduler or recursive scans. Read own data descriptors only; hide inspector metadata and preserve symbol identities.
- While Compare is open, keep the last selected variable-tree scope active. Other scope pausing remains unchanged. First observation establishes the baseline, rather than reporting existing properties as additions.
- Full-size string editing reuses the primitive editor's conflict, lock and Undo rules; explicit Save/Cancel, multiline text, focus restoration.
- Edit history displays the existing bounded current-moment records and next Undo/Redo steps. It does not allow arbitrary jumps or persist edit records.
- Preserve unrelated `valueSyntax.tsx` and `.serena/` work. No report export, expression evaluation, or complex-value editing.

## Deliverable 1: Automatic polling comparison (features 1 and 3)

Files: watcher sample callback, comparison model/tests/UI, expanded tree sampling, favorites sampling, DirectInspector scope/lifecycle, browser regression, README.
- [x] Write failing tests for automatic primitive transitions, additions/removals, nested/replaced paths, symbols, duplicate samples, bounded history and observer failure isolation.
- [x] Implement successful-sample callback without changing structural equality or normal UI notifications; comparison samples full primitive values from polled containers/favorites.
- [x] Replace manual UI with automatic feed and retain active tree polling while Compare is selected.
- [x] Verify types/unit/lint/build/browser, independently review/fix/re-review until clear, commit.

Deliverable 1 evidence: compile/build, full 99-unit run before final lifecycle regressions, 7 focused comparison/watcher tests, automatic-comparison Chromium flow (including nested replacement, overlap deduplication and collapse/re-expand baseline). Independent review found historical deduplication could hide fresh watcher transitions; fixed with per-poll batch identity and re-reviewed clear.

## Deliverable 2: Full-size string editor (feature 2)

Files: PrimitiveVariableEditor, VariableDetails, relevant tests/browser, README.
- [x] Add a wide multiline editor in details using the same guarded save and locked-target update.
- [x] Verify save/cancel/Undo, locked edits, replaced-owner and later-game-write conflicts, read-only values, keyboard/focus behavior.
- [x] Independently review/fix/re-review until clear, commit.

Deliverable 2 evidence: compile, all 101 unit tests, build, three Chromium details/edit regressions (multiline Save/Cancel/Escape/Undo/locks; later game-write conflict/read-only strings; existing viewer/copy/live path), scoped lint. Independent review clear. Drafts capture owner/path/original/lock identity, use existing save services, and return focus to Edit string or the heading.

## Deliverable 3: Visible edit history (feature 4)

Files: edit-history UI/model if needed, tests/browser, README.
- [x] Display retained records with path and full before/after values, status and clear next Undo/Redo indication; preserve Back/Forward controls.
- [x] Verify mixed paths, undo/redo/new-edit branching, capacity/current-moment cleanup, accessibility and absence of arbitrary-jump writes.
- [x] Independently review/fix/re-review until clear, commit.

Deliverable 3 evidence: compile, all 101 unit tests, build, three focused edit-history Chromium checks and final full 56-test Chromium suite. Full lint has no errors and the same eight pre-existing ordering warnings. Independent review clear. Stable edit IDs preserve identity across Undo/Redo and replacement branches; read-only chronological panel has a keyboard-focusable scroll region and conditional ARIA controls.

## Final checks

- [x] Compile, full unit suite, lint and standard Chromium browser suite pass; report existing warnings and scope limits.
- [x] Confirm commits and preserve unrelated local changes; report autonomous decisions and review results.
