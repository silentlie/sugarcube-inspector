import { describe, expect, it } from "vitest";
import { SugarCubeVariablesSchema } from "../sugarcube/types";
import { isNonFunctionObject } from "./isNonFunctionObject";

describe("isNonFunctionObject", () => {
  it("accepts objects, arrays, Maps, and Sets but excludes functions and primitives", () => {
    for (const value of [{}, [], new Map(), new Set(), Object.create(null)]) {
      expect(isNonFunctionObject(value)).toBe(true);
    }
    for (const value of [null, undefined, 0, "text", () => undefined]) {
      expect(isNonFunctionObject(value)).toBe(false);
    }
  });
});

describe("SugarCubeVariablesSchema", () => {
  it("preserves the root variable container validation", () => {
    expect(SugarCubeVariablesSchema.safeParse({ story: {}, temporary: {} }).success).toBe(true);
    expect(SugarCubeVariablesSchema.safeParse({ story: new Map(), temporary: new Set() }).success).toBe(true);
    expect(SugarCubeVariablesSchema.safeParse({ story: [], temporary: {} }).success).toBe(false);
    expect(SugarCubeVariablesSchema.safeParse({ story: () => undefined, temporary: {} }).success).toBe(false);
  });
});
