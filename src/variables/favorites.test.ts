import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFavoritePaths, decodeFavoriteUpdate, favoriteSyncGroup, getFavoriteStoragePrefix } from "./favoriteStorage";
import { FavoriteStore, sameFavoritePath } from "./favorites";
import { formatFavoritePath, readVariable, type FavoriteLocation } from "./location";
import { VariableWatcher } from "./watcher";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("favorites", () => {
  it("scopes live sync by origin and IFID while grouping local exports", () => {
    expect(favoriteSyncGroup("file:///one.html", "example-story")).toBe(favoriteSyncGroup("file:///two.html", "example-story"));
    expect(favoriteSyncGroup("https://one.test/story", "example-story")).not.toBe(favoriteSyncGroup("https://two.test/story", "example-story"));
    expect(favoriteSyncGroup("https://one.test/story", "example-story")).not.toBe(favoriteSyncGroup("https://one.test/story", "different-story"));
    expect(favoriteSyncGroup("chrome://extensions", "example-story")).toBeUndefined();
    expect(favoriteSyncGroup("https://one.test/story", "../invalid")).toBeUndefined();
  });

  it("validates live favorite messages and rejects hidden settings paths", () => {
    const detail = JSON.stringify([{ root: "variables", path: ["score"] }]);
    expect(decodeFavoriteUpdate({ detail, pinned: true })).toEqual({ detail, pinned: true });
    for (const message of [{ detail, pinned: "true" }, { detail: "[]", pinned: false },
      { detail: detail.repeat(2000), pinned: true },
      { detail: JSON.stringify([{ root: "variables", path: ["__sugarcubeInspector"] }]), pinned: true }]) {
      expect(decodeFavoriteUpdate(message)).toBeUndefined();
    }
  });
  it("restores an aggregate larger than a single storage message", () => {
    const paths = Array.from({ length: 1000 }, (_, index) => ({
      root: "variables", path: ["player", `equipment-description-for-slot-${index}-in-the-inventory`],
    }));
    expect(decodeFavoritePaths(JSON.stringify(paths))).toHaveLength(paths.length);
  });

  it("uses a valid non-UUID Twine IFID as a story identifier", () => {
    vi.stubGlobal("document", { querySelector: () => ({ getAttribute: () => "SUGARCUBE-EXAMPLE-2026" }) });
    vi.stubGlobal("location", { href: "file:///story.html" });
    expect(getFavoriteStoragePrefix()).toBe("favorites:file::sugarcube-example-2026:");
  });

  it("follows replaced ancestors and retains missing targets", () => {
    const variables: Record<string, unknown> = { player: { health: 10 } };
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
    const location: FavoriteLocation = {
      kind: "favorite", id: -1, root: "variables", path: ["player", "health"],
    };

    expect(readVariable(location)).toMatchObject({ kind: "value", value: 10 });
    variables.player = { health: 40 };
    expect(readVariable(location)).toMatchObject({ kind: "value", value: 40 });
    variables.player = {};
    expect(readVariable(location)).toEqual({ kind: "missing" });
    variables.player = { health: 70 };
    expect(readVariable(location)).toMatchObject({ kind: "value", value: 70 });
  });

  it("retains a favorite whose first read fails and recovers on a later poll", () => {
    vi.useFakeTimers();
    let blocked = true;
    const player = new Proxy({ health: 10 }, {
      getPrototypeOf(target) {
        if (blocked) throw new Error("Temporarily unreadable");
        return Reflect.getPrototypeOf(target);
      },
      getOwnPropertyDescriptor(target, key) {
        if (blocked) throw new Error("Temporarily unreadable");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    vi.stubGlobal("SugarCube", { State: { variables: { player }, temporary: {} } });
    const watcher = new VariableWatcher(20);
    const store = new FavoriteStore(watcher);
    watcher.setScopeActive("favorites", true);
    const favorite = store.add({ root: "variables", path: ["player", "health"] });
    const parent = store.add({ root: "variables", path: ["player"] });
    const subscription = store.getSubscription(favorite.id);
    expect(subscription.getSnapshot()).toEqual({ kind: "missing" });
    expect(store.getSubscription(parent.id).getSnapshot()).toEqual({ kind: "missing" });

    blocked = false;
    vi.advanceTimersByTime(20);
    expect(subscription.getSnapshot()).toMatchObject({ kind: "value", value: 10 });
    expect(store.getSubscription(parent.id).getSnapshot()).toMatchObject({ kind: "value" });

    blocked = true;
    vi.advanceTimersByTime(20);
    expect(store.getSubscription(parent.id).getSnapshot()).toMatchObject({ kind: "value" });
    watcher.setScopeActive("favorites", false);
  });

  it("exposes the current property's writable flag for primitive favorites", () => {
    const player = { health: 10 };
    vi.stubGlobal("SugarCube", { State: { variables: { player }, temporary: {} } });
    const location: FavoriteLocation = {
      kind: "favorite", id: -1, root: "variables", path: ["player", "health"],
    };
    expect(readVariable(location)).toMatchObject({ kind: "value", value: 10, editable: true });
    Object.defineProperty(player, "health", { writable: false });
    expect(readVariable(location)).toMatchObject({ kind: "value", value: 10, editable: false });
  });

  it("does not evaluate intermediate getters and supports symbol paths", () => {
    const getter = vi.fn(() => ({ health: 1 }));
    const variables: Record<PropertyKey, unknown> = {};
    Object.defineProperty(variables, "player", { get: getter });
    const key = Symbol("level");
    variables[key] = 99;
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {} } });
    expect(readVariable({
      kind: "favorite", id: -1, root: "variables", path: ["player", "health"],
    })).toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
    expect(readVariable({
      kind: "favorite", id: -2, root: "variables", path: [key],
    })).toMatchObject({ kind: "value", value: 99 });
  });

  it("formats paths and deduplicates property keys by identity", () => {
    const sym = Symbol("token");
    expect(formatFavoritePath({ root: "variables", path: ["player", "health"] }))
      .toBe("$player.health");
    expect(formatFavoritePath({ root: "temporary", path: ["inventory", "0"] }))
      .toBe("_inventory[0]");
    expect(formatFavoritePath({ root: "variables", path: ["odd key", sym] }))
      .toBe('$["odd key"][Symbol(token)]');
    expect(sameFavoritePath(
      { root: "variables", path: [sym] },
      { root: "variables", path: [sym] },
    )).toBe(true);
    expect(sameFavoritePath(
      { root: "variables", path: [sym] },
      { root: "temporary", path: [sym] },
    )).toBe(false);
  });

  it("keeps explicit watches running while other scopes are inactive and cleans up", () => {
    vi.useFakeTimers();
    const variables = { health: 1 };
    const getter = vi.fn(() => variables);
    vi.stubGlobal("SugarCube", { State: { get variables() { return getter(); }, temporary: {} } });
    const watcher = new VariableWatcher(20);
    const store = new FavoriteStore(watcher);
    const changes = vi.fn();
    const stopListening = store.subscribe(changes);
    const path = { root: "variables" as const, path: ["health"] };
    watcher.setScopeActive("favorites", true);
    const favorite = store.add(path);
    expect(store.add(path).id).toBe(favorite.id);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(changes).toHaveBeenCalledTimes(1);
    watcher.setScopeActive("variables", false);

    variables.health = 5;
    vi.advanceTimersByTime(20);
    expect(store.getSubscription(favorite.id).getSnapshot())
      .toMatchObject({ kind: "value", value: 5 });
    store.remove(path);
    expect(changes).toHaveBeenCalledTimes(2);
    const readsAfterRemoval = getter.mock.calls.length;
    vi.advanceTimersByTime(60);
    expect(getter).toHaveBeenCalledTimes(readsAfterRemoval);
    expect(store.getSnapshot()).toHaveLength(0);
    stopListening();
    watcher.setScopeActive("favorites", false);
  });

  it("keeps the newest twenty preview changes for each pin", () => {
    vi.useFakeTimers();
    const variables = { health: 0 };
    vi.stubGlobal("SugarCube", { State: { variables, temporary: {}, passage: "Vault", turns: 3 } });
    const watcher = new VariableWatcher(20);
    const store = new FavoriteStore(watcher);
    watcher.setScopeActive("favorites", true);
    const favorite = store.add({ root: "variables", path: ["health"] });

    for (let health = 1; health <= 25; health++) {
      variables.health = health;
      vi.advanceTimersByTime(20);
    }

    const changes = store.getChanges(favorite.id);
    expect(changes).toHaveLength(20);
    expect(changes[0]).toMatchObject({ before: "24", after: "25", turn: 3, passage: "Vault" });
    expect(changes.at(-1)).toMatchObject({ before: "5", after: "6" });
    watcher.setScopeActive("favorites", false);
  });
});
