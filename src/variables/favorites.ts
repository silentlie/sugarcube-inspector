import { readVariable, sameVariable, type FavoriteLocation, type FavoritePath, type VariableSnapshot } from "./location";
import { variableWatcher, type VariableSubscription, type VariableWatcher } from "./watcher";

export type Favorite = { location: FavoriteLocation };
type WatchingFavorite = Favorite & {
  subscription: VariableSubscription<VariableSnapshot>;
  unsubscribe: () => void;
};

let nextFavoriteId = -1;

export function sameFavoritePath(a: FavoritePath, b: FavoritePath): boolean {
  return a.root === b.root && a.path.length === b.path.length &&
    a.path.every((segment, index) => Object.is(segment, b.path[index]));
}

/** Owns explicit watches independently of which variable tree is selected. */
export class FavoriteStore {
  private readonly watches = new Map<number, WatchingFavorite>();
  private snapshot: readonly Favorite[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly watcher: VariableWatcher = variableWatcher) {}

  getSnapshot = (): readonly Favorite[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
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
    const subscription = this.watcher.watch(
      () => readVariable(location), sameVariable, "favorites",
    );
    const unsubscribe = subscription.subscribe(() => {
      // The subscription retains the latest snapshot even without a mounted row.
    });
    const entry = { location, subscription, unsubscribe };
    this.watches.set(location.id, entry);
    this.snapshot = [...this.snapshot, { location }];
    this.notify();
    return location;
  }

  remove(path: FavoritePath): void {
    const entry = this.snapshot.find(({ location }) => sameFavoritePath(path, location));
    if (!entry) return;
    this.watches.get(entry.location.id)?.unsubscribe();
    this.watches.delete(entry.location.id);
    this.snapshot = this.snapshot.filter(({ location }) => location.id !== entry.location.id);
    this.notify();
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

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export const favoriteStore = new FavoriteStore();
