import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VariableWatcher, incrementSlot, listChildren, readSlot, readStructure,
  sameSlot, sameStructure,
} from "./variableTree";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recursive variable slots", () => {
  it("reads the current owner property, including replacements and missing slots", () => {
    const player = { health: 10 };
    const slot = { kind: "property" as const, owner: player, key: "health" };
    const initial = readSlot(slot);
    player.health = 20;
    expect(readSlot(slot).value).toBe(20);
    expect(sameSlot(initial, readSlot(slot))).toBe(false);

    const store = { player };
    const parent = { kind: "property" as const, owner: store, key: "player" };
    const first = readSlot(parent);
    store.player = { health: 30 };
    expect(readSlot(parent).value).toBe(store.player);
    expect(sameSlot(first, readSlot(parent))).toBe(false);

    const missing = readSlot({ kind: "property", owner: {}, key: "absent" });
    expect(missing.exists).toBe(false);
    expect(missing.preview).toBe("[Missing]");
  });

  it("notices property additions without treating value edits as structural changes", () => {
    const root: Record<string, unknown> = { day: 1 };
    const first = readStructure(root);
    root.day = 2;
    expect(sameStructure(first, readStructure(root))).toBe(true);
    root.player = { health: 10 };
    expect(sameStructure(first, readStructure(root))).toBe(false);
    expect(listChildren(root).map((entry) => entry.name)).toEqual(["day", "player"]);
  });

  it("notices changes to array length and Map and Set membership", () => {
    const array: unknown[] = new Array(3);
    const beforeArray = readStructure(array);
    array.length = 5;
    expect(sameStructure(beforeArray, readStructure(array))).toBe(false);

    const map = new Map<unknown, unknown>([["one", 1]]);
    const mapShape = readStructure(map);
    map.set("one", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(true);
    const mapValue = listChildren(map).find((child) => child.name === "[0] value")!;
    expect(readSlot(mapValue.slot).value).toBe(2);
    incrementSlot(mapValue.slot);
    expect(map.get("one")).toBe(3);

    map.delete("one");
    map.set("two", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(false);

    const set = new Set(["one"]);
    const setShape = readStructure(set);
    set.delete("one");
    set.add("two");
    expect(sameStructure(setShape, readStructure(set))).toBe(false);
    expect(readSlot(listChildren(set)[0]!.slot).value).toBe("two");
  });

  it("keeps actual object identity and does not invoke getters", () => {
    const player = { score: 3 };
    const parent = { player, leader: player };
    const children = listChildren(parent);
    const first = readSlot(children[0]!.slot);
    const second = readSlot(children[1]!.slot);
    expect(first.value).toBe(second.value);
    const getter = vi.fn(() => 10);
    Object.defineProperty(parent, "derived", { get: getter, enumerable: true });
    const getterSlot = listChildren(parent).find((item) => item.name === "derived")!;
    expect(readSlot(getterSlot.slot).preview).toBe("[getter]");
    expect(getter).not.toHaveBeenCalled();
  });

  it("retains stable property IDs across object additions", () => {
    const obj: Record<string, unknown> = { first: 1 };
    const original = listChildren(obj)[0]!.id;
    obj.second = 2;
    expect(listChildren(obj)[0]!.id).toBe(original);
  });
});

describe("shared variable watcher", () => {
  it("keeps one timer and notifies only changed slots", async () => {
    vi.useFakeTimers();
    const watcher = new VariableWatcher(50);
    let first = 1;
    let second = 2;
    const a = watcher.watch(() => first, Object.is);
    const b = watcher.watch(() => second, Object.is);
    const onA = vi.fn();
    const onB = vi.fn();
    const unsubscribeA = a.subscribe(onA);
    const unsubscribeB = b.subscribe(onB);

    expect(vi.getTimerCount()).toBe(1);
    first = 10;
    await vi.advanceTimersByTimeAsync(50);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    expect(a.getSnapshot()).toBe(10);

    second = 20;
    watcher.refresh();
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);

    unsubscribeA();
    expect(vi.getTimerCount()).toBe(1);
    unsubscribeB();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("catches a mutation that happens before a component subscribes", () => {
    const watcher = new VariableWatcher();
    let value = "old";
    const subscription = watcher.watch(() => value, Object.is);
    value = "new";
    const notify = vi.fn();
    const unsubscribe = subscription.subscribe(notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(subscription.getSnapshot()).toBe("new");
    unsubscribe();
  });
});
