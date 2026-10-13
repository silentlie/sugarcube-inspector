import { afterEach, describe, expect, it, vi } from "vitest";
import { readVariable, sameVariable } from "./variableLocation";
import { getLocationName, listChildren, readStructure, sameStructure } from "./variableStructure";
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

  it("models undefined, non-enumerable, accessors, and missing distinctly", () => {
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

  });

  it("inspects boxed primitives as expandable objects without invoking their methods", () => {
    const values = {
      boxedNumber: new Number(123),
      boxedString: new String("abc"),
      boxedBoolean: new Boolean(false),
      boxedBigInt: Object(42n),
      boxedSymbol: Object(Symbol("sample")),
    };
    for (const [key, type, text] of [
      ["boxedNumber", "Number", "123"],
      ["boxedString", "String", '"abc"'],
      ["boxedBoolean", "Boolean", "false"],
      ["boxedBigInt", "BigInt", "42"],
      ["boxedSymbol", "Symbol", "Symbol(sample)"],
    ] as const) {
      const location = { kind: "property" as const, owner: values, key };
      expect(readVariable(location)).toMatchObject({
        kind: "value", type, preview: text, expandable: true,
      });
      expect(() => getVariableChildren({
        id: 0, location, ancestors: [],
      })).not.toThrow();
    }
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

  it("compares missing and accessor snapshots", () => {
    const missing = { kind: "missing" } as const;
    const getter = { kind: "accessor", accessor: "getter" } as const;
    const setter = { kind: "accessor", accessor: "setter" } as const;

    expect(sameVariable(missing, missing)).toBe(true);
    expect(sameVariable(missing, getter)).toBe(false);
    expect(sameVariable(getter, setter)).toBe(false);
  });

  it("propagates unexpected property descriptor errors unchanged", () => {
    const failure = new Error("uninspectable");
    const proxy = new Proxy({}, {
      getOwnPropertyDescriptor() { throw failure; },
    });
    expect(() => readVariable({ kind: "property", owner: proxy, key: "x" }))
      .toThrow(failure);
  });

  it("propagates unexpected ownKeys errors through structure reads and tree indexing", () => {
    const failure = new Error("uninspectable structure");
    const proxy = new Proxy({}, {
      ownKeys() { throw failure; },
    });

    expect(() => readStructure(proxy)).toThrow(failure);
    expect(() => listChildren(proxy)).toThrow(failure);

    const node: VariableNode = {
      id: 0,
        location: { kind: "property", owner: { proxy }, key: "proxy" },
      ancestors: [],
    };
    expect(() => getVariableChildren(node)).toThrow(failure);
  });

  it("returns a bare empty structure for non-objects", () => {
    expect(readStructure(null)).toEqual([]);
    expect(readStructure(42)).toEqual([]);
  });

  it("notices property additions without treating value edits as structural changes", () => {
    const root: Record<string, unknown> = { day: 1 };
    const first = readStructure(root);
    root.day = 2;
    expect(sameStructure(first, readStructure(root))).toBe(true);
    root.player = { health: 10 };
    expect(sameStructure(first, readStructure(root))).toBe(false);
    expect(listChildren(root).map(getLocationName)).toEqual(["day", "player"]);
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
    expect(initial).toEqual([{ kind: "data", key: "health" }]);

    Object.defineProperty(obj, "health", { enumerable: false, writable: false });
    expect(sameStructure(initial, readStructure(obj))).toBe(true);

    Object.defineProperty(obj, "health", {
      get: () => 100,
      set: () => {},
      configurable: true,
    });
    const accessor = readStructure(obj);
    expect(accessor).toEqual([
      { kind: "accessor", key: "health", getter: true, setter: true },
    ]);
    expect(sameStructure(initial, accessor)).toBe(false);

    Object.defineProperty(obj, "health", { set: undefined });
    expect(readStructure(obj)).toEqual([
      { kind: "accessor", key: "health", getter: true, setter: false },
    ]);
    expect(sameStructure(accessor, readStructure(obj))).toBe(false);
  });

  it("notices changes to array length and Map and Set membership", () => {
    const array: unknown[] = new Array(3);
    const beforeArray = readStructure(array);
    expect(beforeArray).toEqual([{ kind: "data", key: "length", length: 3 }]);
    array.length = 5;
    expect(sameStructure(beforeArray, readStructure(array))).toBe(false);

    const map = new Map<unknown, unknown>([["one", 1]]);
    const mapShape = readStructure(map);
    expect(mapShape).toEqual([{ kind: "map", key: "one" }]);
    map.set("one", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(true);
    const mapEntry = listChildren(map).find((child) => child.kind === "map")!;
    expect(readVariable(mapEntry)).toMatchObject({ kind: "value", value: 2 });
    map.delete("one");
    map.set("two", 2);
    expect(sameStructure(mapShape, readStructure(map))).toBe(false);

    const set = new Set(["one"]);
    const setShape = readStructure(set);
    expect(setShape).toEqual([{ kind: "set", key: "one" }]);
    set.delete("one");
    set.add("two");
    expect(sameStructure(setShape, readStructure(set))).toBe(false);
    expect(readVariable(listChildren(set)[0]!))
      .toMatchObject({ kind: "value", value: "two" });
  });

  it("keeps actual object identity and does not invoke getters", () => {
    const player = { score: 3 };
    const parent = { player, leader: player };
    const children = listChildren(parent);
    const first = readVariable(children[0]!);
    const second = readVariable(children[1]!);
    expect(first.kind).toBe("value");
    expect(second.kind).toBe("value");
    if (first.kind !== "value" || second.kind !== "value") throw new Error("Expected values");
    expect(first.value).toBe(second.value);
    const getter = vi.fn(() => 10);
    Object.defineProperty(parent, "derived", { get: getter, enumerable: true });
    const getterSlot = listChildren(parent).find((item) => getLocationName(item) === "derived")!;
    expect(readVariable(getterSlot))
      .toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
  });



  it("keeps numeric Map and Set node IDs when earlier members disappear", () => {
    const map = new Map([["first", 1], ["second", 2]]);
    const mapRoot: VariableNode = {
      id: 0, location: { kind: "property", owner: { map }, key: "map" }, ancestors: [],
    };
    const second = getVariableChildren(mapRoot)[1]!.id;
    map.delete("first");
    expect(getVariableChildren(mapRoot)[0]!.id).toBe(second);

    const set = new Set(["first", "second"]);
    const setRoot: VariableNode = {
      id: 1, location: { kind: "property", owner: { set }, key: "set" }, ancestors: [],
    };
    const secondSet = getVariableChildren(setRoot)[1]!.id;
    set.delete("first");
    expect(getVariableChildren(setRoot)[0]!.id).toBe(secondSet);
  });

  it("represents each Map entry once, with independently expandable key and value", () => {
    const key = { name: "Alex" };
    const value = { health: 100 };
    const map = new Map<unknown, unknown>([[key, value]]);
    const holder = { map };
    const root: VariableNode = {
      id: 0,
      location: { kind: "property", owner: holder, key: "map" },
      ancestors: [],
    };

    const entries = getVariableChildren(root);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.location).toMatchObject({ kind: "map", owner: map, key });
    expect(getLocationName(entry.location)).toBe("Object");
    expect(readVariable(entry.location)).toMatchObject({ kind: "value", value });

    const sides = getVariableChildren(entry);
    expect(sides.map((side) => getLocationName(side.location))).toEqual(["key", "value"]);
    expect(new Set(sides.map((side) => side.id)).size).toBe(2);
    expect(readVariable(sides[0]!.location)).toMatchObject({ kind: "value", value: key });
    expect(readVariable(sides[1]!.location)).toMatchObject({ kind: "value", value });
    expect(getVariableChildren(sides[0]!).map((child) => getLocationName(child.location)))
      .toEqual(["name"]);
    expect(getVariableChildren(sides[1]!).map((child) => getLocationName(child.location)))
      .toEqual(["health"]);

    const replacement = { health: 25 };
    map.set(key, replacement);
    expect(readVariable(sides[1]!.location)).toMatchObject({ kind: "value", value: replacement });
    expect(getVariableChildren(sides[1]!).map((child) => getLocationName(child.location)))
      .toEqual(["health"]);
    map.delete(key);
    expect(readVariable(sides[0]!.location)).toEqual({ kind: "missing" });
    expect(readVariable(sides[1]!.location)).toEqual({ kind: "missing" });
    expect(getVariableChildren(entry)).toEqual([]);
  });

  it("derives names without indices, even for non-string Map keys and Set members", () => {
    const map = new Map<unknown, unknown>([[42, "value"], [Symbol("x"), 1]]);
    const entries = listChildren(map);
    expect(entries).toHaveLength(2);
    expect(entries.map(getLocationName)).toEqual(["42", "Symbol(x)"]);
    expect(entries.every((entry) => entry.kind === "map")).toBe(true);
    const set = new Set<unknown>(["north", { level: 1 }]);
    expect(listChildren(set).map(getLocationName)).toEqual(['"north"', "Object"]);
  });

  it("does not traverse circular Map keys or Map values indefinitely", () => {
    const map = new Map<unknown, unknown>();
    map.set(map, map);
    const root: VariableNode = {
      id: 0,
      location: { kind: "property", owner: { map }, key: "map" },
      ancestors: [],
    };
    const entry = getVariableChildren(root)[0]!;
    const sides = getVariableChildren(entry);
    expect(sides).toHaveLength(2);
    expect(getVariableChildren(sides[0]!)).toEqual([]);
    expect(getVariableChildren(sides[1]!)).toEqual([]);
  });

  it("retains stable numeric node IDs across object additions", () => {
    const obj: Record<string, unknown> = { first: 1 };
    const root: VariableNode = {
      id: 0, location: { kind: "property", owner: { obj }, key: "obj" }, ancestors: [],
    };
    const original = getVariableChildren(root)[0]!.id;
    obj.second = 2;
    const children = getVariableChildren(root);
    expect(typeof original).toBe("number");
    expect(children[0]!.id).toBe(original);
    expect(children[1]!.id).not.toBe(original);
  });

  it("keeps repeated references distinct and changes IDs when an owner is replaced", () => {
    const shared = { score: 1 };
    const store = { player: shared, leader: shared };
    const root: VariableNode = {
      id: 0, location: { kind: "property", owner: { store }, key: "store" }, ancestors: [],
    };
    const [player, leader] = getVariableChildren(root);
    expect(player!.id).not.toBe(leader!.id);
    const playerScore = getVariableChildren(player!)[0]!;
    const leaderScore = getVariableChildren(leader!)[0]!;
    expect(playerScore.id).not.toBe(leaderScore.id);
    expect(getVariableChildren(player!)[0]!.id).toBe(playerScore.id);

    store.player = { score: 2 };
    const replacement = getVariableChildren(player!)[0]!;
    expect(replacement.id).not.toBe(playerScore.id);
    expect(readVariable(replacement.location)).toMatchObject({ kind: "value", value: 2 });
    expect(getVariableChildren(leader!)[0]!.id).toBe(leaderScore.id);
  });

  it("does not collide across Map entry, Map property, key and value nodes", () => {
    const map = new Map<unknown, unknown>([["tag", { score: 4 }]]);
    Object.defineProperty(map, "tag", { value: 7, configurable: true });
    const root: VariableNode = {
      id: 0, location: { kind: "property", owner: { map }, key: "map" }, ancestors: [],
    };
    const [entry, property] = getVariableChildren(root);
    expect(entry!.id).not.toBe(property!.id);
    const [key, value] = getVariableChildren(entry!);
    expect(key!.id).not.toBe(value!.id);
    expect(new Set([entry!.id, property!.id, key!.id, value!.id]).size).toBe(4);
    expect(getVariableChildren(entry!).map((node) => node.id)).toEqual([key!.id, value!.id]);
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

  it("keeps story and temporary scopes independent while tabs stay mounted", async () => {
    vi.useFakeTimers();
    const watcher = new VariableWatcher(50);
    let story = 1;
    let temporary = 2;
    const a = watcher.watch(() => story, Object.is, "variables");
    const b = watcher.watch(() => temporary, Object.is, "temporary");
    const notifyStory = vi.fn();
    const notifyTemporary = vi.fn();
    const stopStory = a.subscribe(notifyStory);
    const stopTemporary = b.subscribe(notifyTemporary);

    expect(vi.getTimerCount()).toBe(0);
    watcher.setScopeVisible("variables", true);
    expect(vi.getTimerCount()).toBe(1);
    story = 5;
    temporary = 6;
    await vi.advanceTimersByTimeAsync(50);
    expect(a.getSnapshot()).toBe(5);
    expect(b.getSnapshot()).toBe(2);
    expect(notifyStory).toHaveBeenCalledTimes(1);
    expect(notifyTemporary).not.toHaveBeenCalled();

    watcher.setScopeVisible("variables", false);
    expect(vi.getTimerCount()).toBe(0);
    story = 7;
    watcher.setScopeVisible("temporary", true);
    expect(b.getSnapshot()).toBe(6);
    expect(notifyTemporary).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot()).toBe(5);

    watcher.setScopeVisible("variables", true);
    expect(a.getSnapshot()).toBe(7);
    expect(notifyStory).toHaveBeenCalledTimes(2);
    stopStory();
    watcher.setScopeVisible("variables", false);
    stopTemporary();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reactivate subscriptions that unmounted while hidden", () => {
    vi.useFakeTimers();
    const watcher = new VariableWatcher();
    const subscription = watcher.watch(() => 1, Object.is, "variables");
    const unsubscribe = subscription.subscribe(vi.fn());
    unsubscribe();
    watcher.setScopeVisible("variables", true);
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
      id: 0,
        location: { kind: "property", owner: { fn }, key: "fn" },
      ancestors: [],
    };
    const answer = getVariableChildren(parent).find((node) => getLocationName(node.location) === "answer");
    expect(answer).toBeDefined();
    expect(readVariable(answer!.location)).toMatchObject({ kind: "value", value: 42 });
  });

  it("keeps original references, unique path IDs, and stops ancestor cycles", () => {
    const player: Record<string, unknown> = { health: 50 };
    player.self = player;
    const root = { player, leader: player };
    const parent: VariableNode = {
      id: 0,
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
    const self = children.find((node) => getLocationName(node.location) === "self")!;
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
        location: { kind: "property", owner: { object }, key: "object" },
      ancestors: [],
    };
    const children = getVariableChildren(root);
    expect(children).toHaveLength(126);
    expect(children.find((node) => getLocationName(node.location) === "item124")).toBeDefined();
    const computed = children.find((node) => getLocationName(node.location) === "computed")!;
    expect(readVariable(computed.location))
      .toEqual({ kind: "accessor", accessor: "getter" });
    expect(getter).not.toHaveBeenCalled();
  });
});
