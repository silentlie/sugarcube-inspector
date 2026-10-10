# Visible structure watching

**Status:** Implemented on `feat/two-layer-watch-cache`.

## Two lists

- **Favorites** contain explicit watch targets, independent of visibility.
- **Visible** contains visible scalar/opaque leaves and expanded containers.
  Collapsed containers are omitted unless independently favorited. Entries
  carry an `expanded` flag, and the active scope registers an empty-path root
  only if the scope has no child rows.

The visible map lives in a ref because IntersectionObserver changes do not
need to rerender the UI. Favorites live in React state so the star buttons
and missing-favorite placeholders update.

## Poll rules

1. Watch favorite paths using deep equality and clone-on-change,
   even when they are not visible.
2. Watch visible scalar/opaque leaf values.
3. For a visible, **expanded** container, compare the whole container and
   clone it only when changed. Minimize overlapping value watch targets.
4. A **collapsed** container has no visible-watch registration at all.
   Favorites remain active independently. Its preview can remain stale while
   collapsed.
5. Check immediate child structures of visible rows' parents. A visible
   top-level row therefore implicitly watches the root structure. Register
   the active scope root explicitly only while it has no child rows, so
   newly added variables can appear after the scope becomes empty.
   A nonempty root with no visible top-level rows is not monitored.
   New child values are cloned only when first added; removed children use
   delete patches. For Map/Set membership changes, replace the whole
   collection.
6. Expanding an already visible container schedules a poll immediately
   instead of waiting for the 250 ms cadence. If a poll is already in flight,
   queue another poll directly after it finishes.
7. Stop monitoring rows when they are no longer visible unless favorited.
   A deleted unfavorited path is rediscovered by its observed parent/root
   if the game recreates it. Missing favorite paths remain monitored.

Empty objects, arrays, Maps and Sets remain expandable in the UI, allowing
users to explicitly inspect them and trigger immediate refresh.

## Circular references and path replacement

The tree renders circular references as links to the corresponding ancestor
row, including the scope root. Activating a link scrolls to and focuses its
target rather than recursively rendering the same object. Whole-container
updates use structured cloning to preserve object cycles.

The shared mutable patch applicator modifies the existing path's parent and
replaces whole watched values with their incoming clones. It does not reconcile
objects recursively or preserve aliases to the replaced value. Unchanged parent
containers keep their identities, along with sparse-array holes, custom and
symbol properties, and nonenumerable metadata. Own `__proto__` keys are written
as data properties without altering prototypes; invalid nonconfigurable
property deletions fail explicitly.

## Cache consistency

MAIN maintains one synchronized variable snapshot, initialized by a full
snapshot and updated in place using the exact patches returned to the
inspector. Watch registrations determine what to compare, not what cached
knowledge to retain. Both value comparisons and immediate-child structural
comparisons use that latest synchronized state, including all prior patches.
No separate per-target value or structure caches are maintained.

Patch changes are staged before committing, so clone failures cannot partly
advance MAIN's synchronized state. Parent replacement patches supersede
descendant changes. When a fresh full snapshot is captured, MAIN replaces its
synchronized state and increments the generation; the inspector similarly
switches to the new snapshot. A lost reply or generation mismatch triggers a
full resync instead of silently diverging.

The RPC response retains MAIN-world processing duration for diagnostics
but displays no performance warnings.

## Trade-offs

Synchronization guarantees value updates for actively watched paths, not
preservation of JavaScript object identity across paths. Two synchronized
paths that originally alias the same object may diverge when only one is
watched; each catches up when watched again. Clones preserve cycles within
the cloned value, but aliases outside that value need not be retained.
Replacing an object with a different object of deeply equal contents is not
observable through deep comparison, which is acceptable for value inspection.

Collapsed containers intentionally leave the visible watch list. Their
current UI previews can remain stale until expansion or a full snapshot.
Any already synchronized values remain in the evolving snapshot during this
pause. Parents of active visible rows still receive shallow structure checks,
so new siblings can appear even when their parent tile is offscreen.
Ordinary array positions are tracked by path; Map/Set positional entries
are unstable, so the containing collection is the replacement unit.

Watching a very large expanded object can be expensive, even with
compare-before-clone. Changing the 250 ms polling interval or introducing
performance notices remains a separate design decision.

## Accepted design decisions (2026-10-10)

These are deliberate, reviewed trade-offs, not unresolved implementation questions.
Do not repeatedly reopen them without a new correctness issue, measured performance
problem, or changed requirement:

- **Stale collapsed previews are acceptable.** Polling is every 250 ms for
  *registered* paths; expanding a visible container triggers an immediate poll.
  A collapsed, unfavorited container is **not** polled simply because the
  interval is short. Its preview may remain stale until it is watched again
  (for example, after expansion) or a full snapshot is captured.
- **Shared aliases may diverge temporarily, and exact identity preservation
  across paths is not required.** Whole-value patches can break sharing
  between independent synchronized paths. A path catches up when it is
  actively watched again; a short interval does not repair an unregistered
  alias. Do not introduce a global reference registry just for this.
- **Circular nodes should navigate to their ancestors, not recursively
  expand.** Preserve cycles inside an individually structured-cloned value,
  but do not require all sharing across independent clones to survive.
  On mounting and registering an eligible visible watch, current values are
  polled; expanding a container requests an immediate poll. This is not
  a guarantee that every mounted, collapsed container is polled.
- **Deep equality intentionally suppresses same-content identity changes.**
  Reassigning a live object to a different object with deeply equal contents
  should not produce a patch. The inspector tracks values, not live object
  identity. No special identity-change detection is needed.
- **Path-based arrays and whole-collection Map/Set watches are acceptable.**
  Ordinary array indices use paths; Map/Set positional entries are unstable,
  so the containing collection is the replacement unit.
- **Large expanded objects may be expensive to compare in MAIN.** This
  performance cost is accepted for now; do not change the 250 ms interval
  solely on speculation. Keep timing diagnostics available for real-world
  profiling.
- **Full-snapshot recovery is acceptable.** A failed, lost, or generation-
  mismatched watch response triggers a new full snapshot instead of a more
  complicated acknowledgment/replay protocol.

### Root structural-watch edge case (documented; no redesign decision)

A visible top-level row implicitly registers the parent (the scope root)
for *structural* comparison, allowing the inspector to discover new sibling
variables even if their values are not independently watched. An empty active
scope explicitly registers its root, so the first new variable can appear.

However, if the scope root already has children and **none of its top-level
rows are visible**, neither mechanism registers the root structurally. This
can occur when the list is offscreen or its tab is hidden. For example:

```js
// Existing root with two rows, neither currently visible.
State.variables = { mc: { hp: 100 }, gold: 50 };
// The game adds a sibling while no top-level row is visible.
State.variables.newQuest = true;
```

The inspector may not discover `newQuest` until a top-level row becomes
visible again, a relevant watch happens to deliver a patch, or a full
snapshot is requested. Polling every 250 ms **does not** discover a path
that was never registered for comparison. This is separate from an
existing, actively watched value changing.

This behaviour is currently implemented and documented, not an agreed
requirement to redesign. Revisit it only if automatic discovery while
all root rows are offscreen becomes an explicit goal.
