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

## Cache consistency

MAIN maintains one synchronized variable snapshot, initialized by a full
snapshot and updated immutably using the exact patches returned to the
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
