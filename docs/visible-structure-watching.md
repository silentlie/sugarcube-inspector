# Visible structure watching

**Status:** Implemented on `feat/two-layer-watch-cache`.

## Two lists

- **Favorites** contain explicit watch targets, independent of visibility.
- **Visible** contains the paths currently represented by visible rows with
  an `expanded` flag. The selected scope also registers its empty-path root
  even if no variable rows are rendered.

The visible map lives in a ref because IntersectionObserver changes do not
need to rerender the UI. Favorites live in React state so the star buttons
and missing-favorite placeholders update.

## Poll rules

1. Watch favorite paths using the existing deep-equality and clone-on-change
   cache, even when they are not visible.
2. Watch visible scalar/opaque leaf values.
3. For a visible, **expanded** container, compare the whole container and
   clone it only when changed. Minimize overlapping value watch targets.
4. A visible **collapsed** container has no content watch unless favorited.
   Its preview can therefore remain stale while collapsed.
5. Check immediate child structure of the active scope root, including an
   empty root, and of visible rows' parent containers. New child values are
   cloned only when the child first appears; removed children use delete
   patches. For Map/Set membership changes, replace the whole collection.
6. Expanding an already visible container schedules a poll immediately
   instead of waiting for the 250 ms cadence. If a poll is already in flight,
   queue another poll directly after it finishes.
7. Stop monitoring rows when they are no longer visible unless favorited.
   A deleted unfavorited path is rediscovered by its observed parent/root
   if the game recreates it. Missing favorite paths remain monitored.

Empty objects, arrays, Maps and Sets remain expandable in the UI, allowing
users to explicitly inspect them and trigger immediate refresh.

## Cache consistency

The full snapshot is a read-only baseline. The service maintains separate
per-target value overrides and observed child structure; both are cleared
on a new full snapshot. Patch changes are staged and committed atomically
so a clone failure cannot advance one cache without the other. Parent
replacement patches supersede their descendant changes.

The RPC response retains MAIN-world processing duration for diagnostics
but displays no performance warnings.

## Trade-offs

Collapsed containers are intentionally not kept fully synchronized. The
current UI can show stale child counts and types until expansion or a full
snapshot refresh. Parents of visible rows still receive shallow structure
checks, so new siblings can appear while the parent itself is offscreen.
Ordinary array positions are tracked by path; Map/Set positional entries
are unstable, so the containing collection is the replacement unit.

Watching a very large expanded object can be expensive, even with
compare-before-clone. Changing the 250 ms polling interval or introducing
performance notices remains a separate design decision.
