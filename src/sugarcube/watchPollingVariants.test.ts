import { describe, expect, it } from "vitest";
import { ExperimentalWatchPoller, type PollingVariant } from "./watchPollingVariants";

describe.each<PollingVariant>(["compare-first", "clone-first", "always-clone"])("%s", (strategy) => {
  it("returns independent cloned values and sees in-place mutations", () => {
    const source = { items: [{ score: 1 }], checked: true };
    const poller = new ExperimentalWatchPoller(strategy, "arrays-weak");
    const first = poller.poll(source);
    expect(first.changed).toBe(true);
    expect(first.value).toEqual(source);
    expect(first.value).not.toBe(source);

    const second = poller.poll(source);
    expect(second.changed).toBe(strategy === "always-clone");
    if (strategy !== "always-clone") {
      expect(second.value).toBeUndefined();
    }

    source.items[0]!.score = 2;
    const third = poller.poll(source);
    expect(third.changed).toBe(true);
    expect(third.value).toEqual(source);
    expect(first.value).toEqual({ items: [{ score: 1 }], checked: true });
  });

  it("handles cyclic references and collection mutations", () => {
    const values = new Map([["player", { hp: 10 }]]);
    const object: { values: typeof values; self?: unknown } = { values };
    object.self = object;

    const poller = new ExperimentalWatchPoller(strategy);
    poller.poll(object);
    expect(poller.poll(object).changed).toBe(strategy === "always-clone");
    values.get("player")!.hp--;
    expect(poller.poll(object).changed).toBe(true);
  });
});

it("comparison modes detect changes in typed-array backing buffers", () => {
  for (const strategy of ["compare-first", "clone-first"] as const) {
    const storage = Uint8Array.from([1, 2, 3, 4]);
    const view = new Uint8Array(storage.buffer, 1, 2);
    const poller = new ExperimentalWatchPoller(strategy, "arrays-map");
    poller.poll(view);
    expect(poller.poll(view).changed).toBe(false);
    storage[3] = 8;
    expect(poller.poll(view).changed).toBe(true);
  }
});
