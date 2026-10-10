import { describe, expect, it, vi } from "vitest";
import { VariableStore } from "./VariableStore";
import type { WatchTarget } from "../../sugarcube/watch";

const prop = (key: string) => ({ type: "property" as const, key });
const target = (...names: string[]): WatchTarget => ({
  path: ["story", ...names.map(prop)],
});

describe("path subscriptions", () => {
  it("keeps the same variable path isolated across story and temporary scopes", () => {
    const store = new VariableStore({
      story: { score: 1 },
      temporary: { score: 2 },
    });
    const storyListener = vi.fn();
    const temporaryListener = vi.fn();
    store.subscribe({ path: ["story", prop("score")] }, storyListener);
    store.subscribe({ path: ["temporary", prop("score")] }, temporaryListener);

    store.apply([{ op: "set", path: ["temporary", prop("score")], value: 3 }]);

    expect(store.getValue({ path: ["story", prop("score")] })).toBe(1);
    expect(store.getValue({ path: ["temporary", prop("score")] })).toBe(3);
    expect(storyListener).not.toHaveBeenCalled();
    expect(temporaryListener).toHaveBeenCalledTimes(1);
  });

  it("notifies the changed leaf and aliases, but not an unrelated root or sibling", () => {
    const shared = { hp: 10, mp: 5 };
    const store = new VariableStore({
      story: { left: shared, right: shared, unrelated: 99 }, temporary: {},
    });
    const left = vi.fn();
    const right = vi.fn();
    const sibling = vi.fn();
    const root = vi.fn();
    const unchanged = vi.fn();
    store.subscribe(target("left", "hp"), left);
    store.subscribe(target("right", "hp"), right);
    store.subscribe(target("right", "mp"), sibling);
    store.subscribe(target(), root);
    store.subscribe(target("unrelated"), unchanged);

    store.apply([{ op: "set", path: target("left", "hp").path, value: 20 }]);

    const story = store.variables.story as Record<string, unknown>;
    expect(story.left).toBe(shared);
    expect(story.right).toBe(shared);
    expect(shared.hp).toBe(20);
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(1);
    expect(root).not.toHaveBeenCalled();
    expect(unchanged).not.toHaveBeenCalled();
    // The alias is notified conservatively at the shared-object boundary.
    expect(sibling).toHaveBeenCalledTimes(1);
  });

  it("does not notify an unchanged alias when another path replaces its object", () => {
    const shared = { hp: 10 };
    const store = new VariableStore({
      story: { left: shared, right: shared }, temporary: {},
    });
    const left = vi.fn();
    const right = vi.fn();
    store.subscribe(target("left", "hp"), left);
    store.subscribe(target("right", "hp"), right);

    store.apply([{ op: "set", path: target("left").path, value: { hp: 30 } }]);

    const story = store.variables.story as { left: { hp: number }; right: { hp: number } };
    expect(story.left.hp).toBe(30);
    expect(story.right.hp).toBe(10);
    expect(story.left).not.toBe(story.right);
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).not.toHaveBeenCalled();
  });

  it("notifies container structure on array-length and child-membership changes", () => {
    const store = new VariableStore({
      story: { inventory: ["map"] }, temporary: {},
    });
    const array = vi.fn();
    const root = vi.fn();
    store.subscribe(target("inventory"), array);
    store.subscribe(target(), root);

    store.apply([{ op: "set", path: target("inventory", "length").path, value: 3 }]);
    expect((store.variables.story as { inventory: unknown[] }).inventory.length).toBe(3);
    expect(array).toHaveBeenCalledTimes(1);
    expect(root).not.toHaveBeenCalled();

    store.apply([{ op: "set", path: target("newVar").path, value: true }]);
    expect(root).toHaveBeenCalledTimes(1);
  });

  it("notifies descendants when an ancestor container is replaced", () => {
    const store = new VariableStore({
      story: { player: { hp: 10 } }, temporary: {},
    });
    const changed = vi.fn();
    store.subscribe(target("player", "hp"), changed);
    store.apply([{ op: "set", path: target("player").path, value: { hp: 3 } }]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(store.getValue(target("player", "hp"))).toBe(3);
  });
});
