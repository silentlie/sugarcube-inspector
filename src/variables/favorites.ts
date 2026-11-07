import type { SaveObject } from "twine-sugarcube";
import { getState } from "../sugarcube/state";
import { polledChanges } from "./comparison";
import { readVariable, sameVariable, type FavoriteLocation, type FavoritePath, type VariableSnapshot } from "./location";
import { variableWatcher, type VariableSubscription, type VariableWatcher } from "./watcher";
import { decodeFavoritePaths, decodeFavoriteUpdate, favoriteStorageEvents as events, getFavoriteStoragePrefix, inspectorSettingsKey } from "./favoriteStorage";
import { readStoryFavorites, writeStoryFavorites } from "./storySettings";

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
    let sampled = initial;
    const subscription = this.watcher.watch(
      () => readVariable(location), sameVariable, "favorites", initial, (next, batch) => {
        const before = sampled;
        sampled = next;
        polledChanges.observeValue(path, before, next, batch);
      },
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

  clear(): void {
    for (const { location } of this.snapshot) this.remove(location);
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
  if (!getState().passage) {
    let disconnect: (() => void) | undefined;
    const stopWaiting = variableWatcher.beforeRefresh(() => {
      if (!getState().passage) return;
      stopWaiting();
      disconnect = connectFavoriteStorage();
    });
    return () => { stopWaiting(); disconnect?.(); };
  }
  let initial: FavoritePath[] | undefined;
  try {
    initial = readStoryFavorites();
    if (!initial) writeStoryFavorites([]);
  } catch (error) {
    console.warn("SugarCube Inspector could not initialize story settings.", error);
    return;
  }
  let applying = false;
  let signature = JSON.stringify(initial ?? []);
  let restored = initial !== undefined || !getFavoriteStoragePrefix();
  const initialMoment = getState().active;
  const pending = new Map<string, boolean>();
  const encode = ({ root, path }: FavoritePath) => JSON.stringify({ root, path });
  const serializable = (path: FavoritePath) => path.path.every((key) => typeof key === "string");
  const apply = (paths: FavoritePath[]) => {
    applying = true;
    try {
      for (const { location } of favoriteStore.getSnapshot()) {
        if (serializable(location) && !paths.some((path) => sameFavoritePath(location, path))) favoriteStore.remove(location);
      }
      for (const path of paths) favoriteStore.add(path);
    } finally { applying = false; }
  };
  const write = () => {
    const paths = favoriteStore.getSnapshot().map(({ location: { root, path } }) => ({ root, path }))
      .filter(serializable);
    writeStoryFavorites(paths);
    signature = JSON.stringify(paths);
  };
  const refresh = () => {
    const paths = readStoryFavorites() ?? [];
    const next = JSON.stringify(paths);
    if (next !== signature) {
      apply(paths);
      signature = next;
    }
  };
  apply(initial ?? []);
  const unsubscribe = favoriteStore.subscribe((location, pinned) => {
    if (applying || !serializable(location)) return;
    try {
      refresh();
      applying = true;
      try {
        if (pinned) favoriteStore.add(location);
        else favoriteStore.remove(location);
      } finally { applying = false; }
      write();
      if (!restored) pending.set(encode(location), pinned);
      document.dispatchEvent(new CustomEvent(pinned ? events.pin : events.unpin, {
        detail: JSON.stringify([{ root: location.root, path: location.path }]),
      }));
    } catch (error) { console.warn("SugarCube Inspector could not save story settings.", error); }
  });
  const receive = (event: Event) => {
    try {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      const update = decodeFavoriteUpdate(JSON.parse(detail));
      if (!update) return;
      const path = decodeFavoritePaths(update.detail)![0]!;
      refresh();
      applying = true;
      try {
        if (update.pinned) favoriteStore.add(path);
        else favoriteStore.remove(path);
      } finally { applying = false; }
      write();
      if (!restored) pending.set(encode(path), update.pinned);
    } catch (error) { console.warn("SugarCube Inspector could not apply a synchronized favorite.", error); }
  };
  document.addEventListener(events.remote, receive);
  const load = () => { if (!restored) document.dispatchEvent(new Event(events.load)); };
  const restore = (event: Event) => {
    if (restored) return;
    const paths = decodeFavoritePaths((event as CustomEvent<unknown>).detail);
    if (!paths) return;
    restored = true;
    if (getState().active !== initialMoment) return;
    const merged: FavoritePath[] = favoriteStore.getSnapshot().map(({ location }) => location).filter(serializable);
    for (const path of paths) {
      if (pending.get(encode(path)) !== false && !merged.some((old) => sameFavoritePath(old, path))) merged.push(path);
    }
    try { apply(merged); write(); }
    catch (error) { console.warn("SugarCube Inspector could not migrate favorites.", error); }
    pending.clear();
  };
  const stopRefreshing = variableWatcher.beforeRefresh(() => {
    try { refresh(); } catch { /* Keep session favorites if reserved metadata becomes unreadable. */ }
  });
  document.addEventListener(events.ready, load);
  document.addEventListener(events.loaded, restore);
  // SugarCube saves the pre-render history snapshot, not the live active moment.
  const onSave = (save: SaveObject) => {
    try {
      const moment = save.state.history[save.state.index];
      const favorites = readStoryFavorites();
      if (moment && favorites) moment.variables[inspectorSettingsKey] = { version: 1, favorites };
    } catch { /* Invalid inspector metadata must not block saving game progress. */ }
  };
  SugarCube.Save.onSave.add(onSave);
  load();
  return () => {
    unsubscribe();
    stopRefreshing();
    SugarCube.Save.onSave.delete(onSave);
    document.removeEventListener(events.remote, receive);
    document.removeEventListener(events.ready, load);
    document.removeEventListener(events.loaded, restore);
  };
}
