import { describe, expect, it } from "vitest";
import { inlinePreview, typeToken, valueToken } from "./valueSyntax";

describe("Prism syntax tokens", () => {
  it("uses established Prism token classes for values and types", () => {
    expect(valueToken("string")).toBe("string");
    expect(valueToken("number")).toBe("number");
    expect(valueToken("NaN")).toBe("number");
    expect(valueToken("boolean")).toBe("boolean");
    expect(valueToken("Function")).toBe("function");
    expect(valueToken("Array")).toBe("punctuation");
    expect(typeToken("string")).toBe("keyword");
    expect(typeToken("Map")).toBe("class-name");
  });

  it("avoids repeating collection and function type names", () => {
    expect(inlinePreview("Array", "Array(3)")).toBe("(3)");
    expect(inlinePreview("Map", "Map(2)")).toBe("(2)");
    expect(inlinePreview("Set", "Set(1)")).toBe("(1)");
    expect(inlinePreview("Function", "[Function]")).toBe("ƒ");
    expect(inlinePreview("Object", "Object")).toBe("{…}");
    expect(inlinePreview("string", '"Alex"')).toBe('"Alex"');
  });
});
