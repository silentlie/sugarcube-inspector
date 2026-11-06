import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteStore, sameFavoritePath } from "./favorites";
import { formatFavoritePath, readVariable, type FavoriteLocation } from "./location";
import { VariableWatcher } from "./watcher";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("favorites", () => {
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
});
