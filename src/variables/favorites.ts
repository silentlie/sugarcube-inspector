import { getState } from "../sugarcube/state";
import { readVariable, sameVariable, type FavoriteLocation, type FavoritePath, type VariableSnapshot } from "./location";
import { variableWatcher, type VariableSubscription, type VariableWatcher } from "./watcher";
import { decodeFavoritePaths, favoriteStorageEvents as events, getFavoriteStoragePrefix } from "./favoriteStorage";

export type Favorite = { location: FavoriteLocation };
type FavoriteChange = { id: number; before: string; after: string; turn: number; passage: string };
type WatchingFavorite = Favorite & {
  subscription: VariableSubscription<VariableSnapshot>;
  unsubscribe: () => void;
  changes: FavoriteChange[];
};
type FavoriteListener = (location: FavoritePath, pinned: boolean) => void;

let nextFavoriteId = -1;

export function sameFavoritePath(a: FavoritePath, b: FavoritePath): boolean {
  return a.root === b.root && a.path.length === b.path.length &&
    a.path.every((segment, index) => Object.is(segment, b.path[index]));
}

function changePreview(snapshot: VariableSnapshot): string {
  if (snapshot.kind === "value") return snapshot.preview;
  return snapshot.kind === "missing" ? "Missing" : `[${snapshot.accessor}]`;
}

/** Owns explicit watches independently of which variable tree is selected. */
export class FavoriteStore {
  private readonly watches = new Map<number, WatchingFavorite>();
  private snapshot: readonly Favorite[] = [];
  private readonly listeners = new Set<FavoriteListener>();

  constructor(private readonly watcher: VariableWatcher = variableWatcher) {}

  getSnapshot = (): readonly Favorite[] => this.snapshot;

  subscribe = (listener: FavoriteListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isFavorite(path: FavoritePath): boolean {
    return this.snapshot.some(({ location }) => sameFavoritePath(path, location));
  }

  add(path: FavoritePath): FavoriteLocation {
    const existing = this.snapshot.find(({ location }) => sameFavoritePath(path, location));
    if (existing) return existing.location;

    const location: FavoriteLocation = {
      kind: "favorite", id: nextFavoriteId--,
      root: path.root, path: [...path.path],
    };
    let initial: VariableSnapshot;
    try {
      initial = readVariable(location);
    } catch {
      // A saved pin may point to a value the current export cannot preview.
      initial = { kind: "missing" };
    }
    const subscription = this.watcher.watch(
      () => readVariable(location), sameVariable, "favorites", initial,
    );
    const changes: FavoriteChange[] = [];
    let previous = changePreview(initial);
    let nextChangeId = 0;
    const unsubscribe = subscription.subscribe(() => {
      const after = changePreview(subscription.getSnapshot());
      if (after === previous) return;
      const { turns, passage } = getState();
      changes.unshift({ id: nextChangeId++, before: previous, after, turn: turns, passage });
      if (changes.length > 20) changes.pop();
      previous = after;
    });
    const entry = { location, subscription, unsubscribe, changes };
    this.watches.set(location.id, entry);
    this.snapshot = [...this.snapshot, { location }];
    this.notify(location, true);
    return location;
  }

  remove(path: FavoritePath): void {
    const entry = this.snapshot.find(({ location }) => sameFavoritePath(path, location));
    if (!entry) return;
    this.watches.get(entry.location.id)?.unsubscribe();
    this.watches.delete(entry.location.id);
    this.snapshot = this.snapshot.filter(({ location }) => location.id !== entry.location.id);
    this.notify(entry.location, false);
  }

  toggle(path: FavoritePath): void {
    if (this.isFavorite(path)) this.remove(path);
    else this.add(path);
  }

  getSubscription(id: number): VariableSubscription<VariableSnapshot> {
    const subscription = this.watches.get(id)?.subscription;
    if (!subscription) throw new Error("Favorite no longer exists");
    return subscription;
  }

  getChanges(id: number): readonly FavoriteChange[] {
    return this.watches.get(id)?.changes ?? [];
  }

  private notify(location: FavoritePath, pinned: boolean): void {
    for (const listener of [...this.listeners]) listener(location, pinned);
  }
}

export const favoriteStore = new FavoriteStore();

export function connectFavoriteStorage(): (() => void) | undefined {
  if (!getFavoriteStoragePrefix()) return;
  let restored = false;
  const pending = new Map<string, boolean>();
  const load = () => document.dispatchEvent(new Event(events.load));
  const encode = ({ root, path }: FavoritePath) => JSON.stringify([{ root, path }]);
  const save = (detail: string, pinned: boolean) =>
    document.dispatchEvent(new CustomEvent(pinned ? events.pin : events.unpin, { detail }));
  const onChange: FavoriteListener = (location, pinned) => {
    if (!location.path.every((key) => typeof key === "string")) return;
    const detail = encode(location);
    if (restored) save(detail, pinned);
    else pending.set(detail, pinned);
  };
  let unsubscribe = favoriteStore.subscribe(onChange);
  const restore = (event: Event) => {
    if (restored) return;
    const paths = decodeFavoritePaths((event as CustomEvent<unknown>).detail);
    if (!paths) return;
    unsubscribe();
    for (const path of paths) {
      if (!pending.has(encode(path))) favoriteStore.add(path);
    }
    restored = true;
    for (const [detail, pinned] of pending) save(detail, pinned);
    pending.clear();
    unsubscribe = favoriteStore.subscribe(onChange);
  };

  document.addEventListener(events.ready, load);
  document.addEventListener(events.loaded, restore);
  load();
  return () => {
    unsubscribe();
    document.removeEventListener(events.ready, load);
    document.removeEventListener(events.loaded, restore);
  };
}
