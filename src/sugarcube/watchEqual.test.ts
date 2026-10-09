import { describe, expect, it } from "vitest";
import { equalWatchedValues as equal } from "./watchEqual";

describe("optimized watch equality", () => {
  it("compares scalar values using Object.is semantics", () => {
    expect(equal(NaN, NaN)).toBe(true);
    expect(equal(-0, 0)).toBe(false);
    expect(equal(undefined, null)).toBe(false);
    expect(equal("hello", "hello")).toBe(true);
    expect(equal(42n, 42n)).toBe(true);
  });

  it("short-circuits nested object and array changes without confusing reordered keys", () => {
    const original = {
      player: { name: "Mara", stats: [1, { agility: 10 }, 3] },
      flag: true,
    };
    const baseline = structuredClone(original);
    expect(equal(baseline, original)).toBe(true);
    original.player.stats[1] = { agility: 11 };
    expect(equal(baseline, original)).toBe(false);
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(equal({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("checks dense arrays and preserves sparse-array and custom-key semantics", () => {
    const dense = Array.from({ length: 250 }, (_, i) => ({ i, active: true }));
    const clone = structuredClone(dense);
    expect(equal(dense, clone)).toBe(true);
    clone[249]!.active = false;
    expect(equal(dense, clone)).toBe(false);

    const a: unknown[] = new Array<unknown>(3);
    a[0] = 1;
    a[2] = 3;
    const b: unknown[] = [1, undefined, 3];
    expect(equal(a, structuredClone(a))).toBe(true);
    expect(equal(a, b)).toBe(false);
    expect(equal([1, 2], [1, 2, 3])).toBe(false);

    const withKey = Object.assign(a.slice(), { label: "X" });
    const withKeyCopy = structuredClone(withKey);
    expect(equal(withKey, withKeyCopy)).toBe(true);
    const changed = Object.assign(a.slice(), { label: "Y" });
    expect(equal(withKey, changed)).toBe(false);
  });

  it("compares Map and Set entries including independently cloned object keys", () => {
    const map = new Map<object, unknown>([
      [{ id: 1 }, new Set([{ score: 3 }, { score: 4 }])],
      [{ id: 2 }, { item: "potion" }],
    ]);
    const baseline = structuredClone(map);
    expect(equal(map, baseline)).toBe(true);

    const firstValue = map.values().next().value;
    if (!(firstValue instanceof Set)) throw new Error("Unexpected Map fixture");
    (firstValue.values().next().value as { score: number }).score = 7;
    expect(equal(map, baseline)).toBe(false);

    const reordered = new Map([...baseline.entries()].reverse());
    expect(equal(baseline, reordered)).toBe(false); // False positive is safe.
  });

  it("detects typed array mutations with aligned and unaligned byte offsets", () => {
    const source = Uint8Array.from(Array.from({ length: 257 }, (_, i) => i % 251));
    const baseline = structuredClone(source);
    expect(equal(source, baseline)).toBe(true);
    source[256] = 99;
    expect(equal(source, baseline)).toBe(false);

    const buffer = new ArrayBuffer(18);
    const unaligned = new DataView(buffer, 1, 13);
    for (let i = 0; i < 13; i++) unaligned.setUint8(i, i);
    const copy = structuredClone(unaligned);
    expect(equal(unaligned, copy)).toBe(true);
    unaligned.setUint8(12, 99);
    expect(equal(unaligned, copy)).toBe(false);

    expect(equal(new Uint16Array([1, 2]), new Uint8Array([1, 0, 2, 0]))).toBe(false);
    expect(equal(new ArrayBuffer(8), new ArrayBuffer(9))).toBe(false);

    const backing = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const subview = new Uint8Array(backing.buffer, 1, 2);
    const previous = structuredClone(subview);
    backing[5] = 99;
    // A full structured clone of subview includes bytes outside its range.
    expect(equal(subview, previous)).toBe(false);

    const sharedBuffer = new ArrayBuffer(8);
    const pair = { a: new Uint8Array(sharedBuffer), b: new Uint8Array(sharedBuffer) };
    const separate = {
      a: new Uint8Array(new ArrayBuffer(8)),
      b: new Uint8Array(new ArrayBuffer(8)),
    };
    expect(equal(pair, structuredClone(pair))).toBe(true);
    expect(equal(pair, separate)).toBe(false);
  });

  it("handles Date, RegExp, Error and boxed primitive values", () => {
    expect(equal(new Date("2024-01-01"), new Date("2024-01-01"))).toBe(true);
    expect(equal(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(false);
    expect(equal(/test/gi, /test/gi)).toBe(true);
    expect(equal(/test/gi, /test/i)).toBe(false);
    const error = new TypeError("oops", { cause: new Error("root") });
    expect(equal(error, structuredClone(error))).toBe(true);
    expect(equal(new TypeError("a"), new TypeError("b"))).toBe(false);
    expect(equal(Object(123), structuredClone(Object(123)))).toBe(true);
    expect(equal(Object(123), Object(124))).toBe(false);
  });

  it("preserves cycles and catches shared-reference alias changes in both directions", () => {
    const shared = { amount: 5 };
    const graph: { first: { amount: number }; second: { amount: number }; self?: unknown } =
      { first: shared, second: shared };
    graph.self = graph;
    const clone = structuredClone(graph);
    expect(equal(graph, clone)).toBe(true);

    const split = { first: { amount: 5 }, second: { amount: 5 } };
    expect(equal(graph, split)).toBe(false);
    expect(equal({ first: shared, second: shared }, split)).toBe(false);
    expect(equal(split, { first: shared, second: shared })).toBe(false);

    const another = structuredClone(graph);
    another.second = { amount: 5 };
    expect(equal(graph, another)).toBe(false);
    another.second = another.first;
    another.first.amount = 6;
    expect(equal(graph, another)).toBe(false);
  });

  it("conservatively reports unsupported opaque values as different", () => {
    expect(equal(new WeakMap(), new WeakMap())).toBe(false);
    expect(equal(new WeakSet(), new WeakSet())).toBe(false);
    expect(equal({ a: 1 }, new Date())).toBe(false);
  });
});
