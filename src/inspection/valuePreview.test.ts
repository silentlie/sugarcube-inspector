import { describe, expect, it } from "vitest";
import { preview } from "./valuePreview";

describe("value preview", () => {
  it("previews boxed primitives by their underlying values", () => {
    expect(preview(new Number(123))).toBe("123");
    expect(preview(new String("abc"))).toBe('"abc"');
    expect(preview(new Boolean(false))).toBe("false");
    expect(preview(Object(42n))).toBe("42");
    expect(preview(Object(Symbol("test")))).toBe("Symbol(test)");
  });

  it("previews primitives, functions and collections without changing special cases", () => {
    expect(preview(null)).toBe("null");
    expect(preview(undefined)).toBe("undefined");
    expect(preview(Number.NaN)).toBe("NaN");
    expect(preview(12n)).toBe("12");
    expect(preview(() => 1)).toBe("[Function]");
    expect(preview([1, 2])).toBe("Array(2)");
    expect(preview(new Map([["x", 1]]))).toBe("Map(1)");
    expect(preview(new Set([1]))).toBe("Set(1)");
  });
});
