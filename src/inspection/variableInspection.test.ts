import { afterEach, describe, expect, it, vi } from "vitest";
import { readVariable, sameVariable } from "./variableLocation";
import { listChildren, readStructure, sameStructure } from "./variableStructure";
import { getVariableChildren, type VariableNode } from "./variableTree";
import { VariableWatcher } from "./variableWatcher";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recursive variable locations", () => {
  it("identifies live values for syntax highlighting without invoking property getters", () => {
    const subject = { name: "Alex", count: 4, active: true, list: [1], fn: () => 1 };
    const typeFor = (key: keyof typeof subject) => {
      const result = readVariable({ kind: "property", owner: subject, key });
      return result.kind === "value" ? result.type : result.kind;
    };
    expect(typeFor("name")).toBe("string");
    expect(typeFor("count")).toBe("number");
    expect(typeFor("active")).toBe("boolean");
    expect(typeFor("list")).toBe("Array");
    expect(typeFor("fn")).toBe("Function");

    const getter = vi.fn(() => 1);
    Object.defineProperty(subject, "computed", { get: getter });
    expect(readVariable({ kind: "property", owner: subject, key: "computed" }))
      .toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("reads the current owner property, including replacements and missing locations", () => {
    const player = { health: 10 };
    const location = { kind: "property" as const, owner: player, key: "health" };
    const initial = readVariable(location);
    player.health = 20;
    expect(readVariable(location)).toMatchObject({ kind: "value", value: 20 });
    expect(sameVariable(initial, readVariable(location))).toBe(false);

    const store = { player };
    const parent = { kind: "property" as const, owner: store, key: "player" };
    const first = readVariable(parent);
    store.player = { health: 30 };
    expect(readVariable(parent)).toMatchObject({ kind: "value", value: store.player });
    expect(sameVariable(first, readVariable(parent))).toBe(false);

    const missing = readVariable({ kind: "property", owner: {}, key: "absent" });
    expect(missing).toEqual({ kind: "missing" });
  });

  it("models undefined, non-enumerable, accessors, missing, and errors distinctly", () => {
    const obj = { present: undefined } as Record<string, unknown>;
    const present = { kind: "property" as const, owner: obj, key: "present" };
    expect(readVariable(present)).toEqual({
      kind: "value", value: undefined, type: "undefined",
      preview: "undefined", expandable: false,
    });
    Object.defineProperty(obj, "hidden", { value: 10, enumerable: false });
    expect(readVariable({ kind: "property", owner: obj, key: "hidden" }))
      .toMatchObject({ kind: "value", value: 10 });
    delete obj.present;
    expect(readVariable(present)).toEqual({ kind: "missing" });

    Object.defineProperty(obj, "computed", { get: () => 1, set: () => {} });
    expect(readVariable({ kind: "property", owner: obj, key: "computed" }))
      .toEqual({ kind: "accessor", accessor: "getter/setter" });

    const proxy = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error("uninspectable"); },
    });
    expect(readVariable({ kind: "property", owner: proxy, key: "x" }))
      .toEqual({ kind: "error", error: "uninspectable" });
  });

  it("captures mutable previews when values retain their identity", () => {
    const inventory = ["map"];
    const location = { kind: "property" as const, owner: { inventory }, key: "inventory" };
    const before = readVariable(location);
    inventory.push("torch");
    const after = readVariable(location);

    expect(before).toMatchObject({ kind: "value", preview: "Array(1)", expandable: true });
    expect(after).toMatchObject({ kind: "value", preview: "Array(2)", expandable: true });
    expect(sameVariable(before, after)).toBe(false);
  });

  it("compares snapshot kinds and accessor/error details", () => {
    const missing = { kind: "missing" } as const;
    const getter = { kind: "accessor", accessor: "getter" } as const;
    const setter = { kind: "accessor", accessor: "setter" } as const;
    const error = { kind: "error", error: "no access" } as const;

    expect(sameVariable(missing, missing)).toBe(true);
    expect(sameVariable(missing, getter)).toBe(false);
    expect(sameVariable(getter, setter)).toBe(false);
    expect(sameVariable(error, { kind: "error", error: "no access" })).toBe(true);
    expect(sameVariable(error, { kind: "error", error: "changed" })).toBe(false);
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

  it("compares typed structure without tracking enumerable or writable flags", () => {
    const obj: Record<string, unknown> = {};
    Object.defineProperty(obj, "health", {
      value: 100,
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const initial = readStructure(obj);
    expect(initial.parts).toEqual([{ kind: "data", key: "health" }]);

    Object.defineProperty(obj, "health", { enumerable: false, writable: false });
    expect(sameStructure(initial, readStructure(obj))).toBe(true);

    Object.defineProperty(obj, "health", {
      get: () => 100,
      set: () => {},
      configurable: true,
    });
    const accessor = readStructure(obj);
    expect(accessor.parts).toEqual([
      { kind: "accessor", key: "health", getter: true, setter: true },
    ]);
    expect(sameStructure(initial, accessor)).toBe(false);

    Object.defineProperty(obj, "health", { set: undefined });
    expect(readStructure(obj).parts).toEqual([
      { kind: "accessor", key: "health", getter: true, setter: false },
    ]);
    expect(sameStructure(accessor, readStructure(obj))).toBe(false);
  });

  it("notices changes to array length and Map and Set membership", () => {
    const array: unknown[] = new Array(3);
    const beforeArray = readStructure(array);
    expect(beforeArray.parts).toEqual([{ kind: "data", key: "length", length: 3 }]);
    array.length = 5;
    expect(sameStructure(beforeArray, readStructure(array))).toBe(false);

    const map = new Map<unknown, unknown>([["one", 1]]);
    const mapShape = readStructure(map);
    expect(mapShape.parts).toEqual([{ kind: "map", key: "one" }]);
    map.set("one", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(true);
    const mapValue = listChildren(map).find((child) => child.name === "[0] value")!;
    expect(readVariable(mapValue.location)).toMatchObject({ kind: "value", value: 2 });
    map.delete("one");
    map.set("two", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(false);

    const set = new Set(["one"]);
    const setShape = readStructure(set);
    expect(setShape.parts).toEqual([{ kind: "set", key: "one" }]);
    set.delete("one");
    set.add("two");
    expect(sameStructure(setShape, readStructure(set))).toBe(false);
    expect(readVariable(listChildren(set)[0]!.location))
      .toMatchObject({ kind: "value", value: "two" });
  });

  it("keeps actual object identity and does not invoke getters", () => {
    const player = { score: 3 };
    const parent = { player, leader: player };
    const children = listChildren(parent);
    const first = readVariable(children[0]!.location);
    const second = readVariable(children[1]!.location);
    expect(first.kind).toBe("value");
    expect(second.kind).toBe("value");
    if (first.kind !== "value" || second.kind !== "value") throw new Error("Expected values");
    expect(first.value).toBe(second.value);
    const getter = vi.fn(() => 10);
    Object.defineProperty(parent, "derived", { get: getter, enumerable: true });
    const getterSlot = listChildren(parent).find((item) => item.name === "derived")!;
    expect(readVariable(getterSlot.location))
      .toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
  });



  it("keeps collection tile identity when earlier Map and Set members disappear", () => {
    const map = new Map([["first", 1], ["second", 2]]);
    const second = listChildren(map).find((entry) => entry.name === "[1] value")!.id;
    map.delete("first");
    expect(listChildren(map).find((entry) => entry.name === "[0] value")!.id)
      .toBe(second);

    const set = new Set(["first", "second"]);
    const secondSet = listChildren(set).find((entry) => entry.name === "[1]")!.id;
    set.delete("first");
    expect(listChildren(set)[0]!.id).toBe(secondSet);
  });

  it("retains stable property IDs across object additions", () => {
    const obj: Record<string, unknown> = { first: 1 };
    const original = listChildren(obj)[0]!.id;
    obj.second = 2;
    expect(listChildren(obj)[0]!.id).toBe(original);
  });
});

describe("shared variable watcher", () => {
  it("keeps one timer and notifies only changed locations", async () => {
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

describe("Rich Tree View location adapter", () => {
  it("discovers properties on live function references", () => {
    const fn = Object.assign(() => 1, { answer: 42 });
    const parent: VariableNode = {
      id: "fn",
      name: "fn",
      location: { kind: "property", owner: { fn }, key: "fn" },
      ancestors: [],
    };
    const answer = getVariableChildren(parent).find((node) => node.name === "answer");
    expect(answer).toBeDefined();
    expect(readVariable(answer!.location)).toMatchObject({ kind: "value", value: 42 });
  });

  it("keeps original references, unique path IDs, and stops ancestor cycles", () => {
    const player: Record<string, unknown> = { health: 50 };
    player.self = player;
    const root = { player, leader: player };
    const parent: VariableNode = {
      id: "variables",
      name: "variables",
      location: { kind: "property", owner: { root }, key: "root" },
      ancestors: [],
    };
    const firstLevel = getVariableChildren(parent);
    const players = firstLevel;
    expect(players.map((node) => node.id)).toHaveLength(2);
    expect(players[0]!.id).not.toBe(players[1]!.id);
    expect(readVariable(players[0]!.location)).toMatchObject({ kind: "value", value: player });
    expect(readVariable(players[1]!.location)).toMatchObject({ kind: "value", value: player });

    const children = getVariableChildren(players[0]!);
    const self = children.find((node) => node.name === "self")!;
    expect(getVariableChildren(self)).toEqual([]);
  });

  it("indexes all children without calling arbitrary getters", () => {
    const object: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 125 }, (_, i) => [`item${i}`, i]),
    );
    const getter = vi.fn(() => 99);
    Object.defineProperty(object, "computed", { get: getter, enumerable: true });
    const root: VariableNode = {
      id: "root",
      name: "root",
      location: { kind: "property", owner: { object }, key: "object" },
      ancestors: [],
    };
    const children = getVariableChildren(root);
    expect(children).toHaveLength(126);
    expect(children.find((node) => node.name === "item124")).toBeDefined();
    const computed = children.find((node) => node.name === "computed")!;
    expect(readVariable(computed.location))
      .toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
  });
});
