import { describe, expect, it } from "vitest";
import { collectionStructure, sameStructure, structureOf } from "./structure";

const identical = Object.is;

describe("sameStructure", () => {
  it("reuses the same collection representation for structural and live tracking", () => {
    const map = new Map<unknown, unknown>([["hp", 10], ["mp", 5]]);
    const set = new Set<unknown>(["hp", "mp"]);
    expect(collectionStructure(map)).toEqual({ kind: "map", members: ["hp", "mp"] });
    expect(collectionStructure(set)).toEqual({ kind: "set", members: ["hp", "mp"] });
    expect(structureOf(map)).toEqual(collectionStructure(map));
    expect(structureOf(set)).toEqual(collectionStructure(set));
    expect(collectionStructure({ hp: 10 })).toBeNull();
  });

  it("treats object keys as unordered and ignores existing property values", () => {
    const before = structureOf({ hp: 100, mp: 50 });
    expect(sameStructure(before, structureOf({ mp: 10, hp: 20 }), identical)).toBe(true);
    expect(sameStructure(before, structureOf({ hp: 100 }), identical)).toBe(false);
    expect(sameStructure(before, structureOf({ hp: 100, mp: 50, xp: 0 }), identical)).toBe(false);
  });

  it("checks array length and enumerable keys, including sparse entries", () => {
    const before = structureOf([10, 20]);
    expect(sameStructure(before, structureOf([30, 40]), identical)).toBe(true);
    expect(sameStructure(before, structureOf([30, 40, 50]), identical)).toBe(false);

    const sparse = new Array<unknown>(2);
    sparse[1] = undefined;
    expect(sameStructure(structureOf(sparse), structureOf([undefined, undefined]), identical)).toBe(false);
    const sameSparse = new Array<unknown>(2);
    sameSparse[1] = 20;
    expect(sameStructure(structureOf(sparse), structureOf(sameSparse), identical)).toBe(true);
  });

  it("compares Map keys in insertion order, not their mapped values", () => {
    const previous = structureOf(new Map([["a", 1], ["b", 2]]));
    expect(sameStructure(previous, structureOf(new Map([["a", 10], ["b", 20]])), identical)).toBe(true);
    expect(sameStructure(previous, structureOf(new Map([["b", 2], ["a", 1]])), identical)).toBe(false);
    expect(sameStructure(previous, structureOf(new Map([["a", 1]])), identical)).toBe(false);
  });

  it("compares Set members in insertion order", () => {
    const previous = structureOf(new Set(["a", "b"]));
    expect(sameStructure(previous, structureOf(new Set(["a", "b"])), identical)).toBe(true);
    expect(sameStructure(previous, structureOf(new Set(["b", "a"])), identical)).toBe(false);
    expect(sameStructure(previous, structureOf(new Set(["a"])), identical)).toBe(false);
  });

  it("uses caller-supplied equality for cloned collection members", () => {
    const previous = structureOf(new Set([{ id: 1 }]));
    const current = structureOf(new Set([{ id: 1 }]));
    expect(sameStructure(previous, current, identical)).toBe(false);
    expect(sameStructure(previous, current, (left, right) =>
      JSON.stringify(left) === JSON.stringify(right))).toBe(true);
  });

  it("distinguishes container types and absent structures", () => {
    expect(sameStructure(null, null, identical)).toBe(true);
    expect(sameStructure(null, structureOf({}), identical)).toBe(false);
    expect(sameStructure(structureOf({}), structureOf([]), identical)).toBe(false);
    expect(sameStructure(structureOf(new Map()), structureOf(new Set()), identical)).toBe(false);
    expect(structureOf(new Date())).toBeNull();
  });
});
