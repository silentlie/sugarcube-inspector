import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore, isReference, preview } from "./direct";

afterEach(() => vi.unstubAllGlobals());

describe("direct MAIN-world access", () => {
  it("returns the live story and temporary stores without cloning them", () => {
    const story = { player: { health: 100 } };
    const temporary = { choice: "north" };
    vi.stubGlobal("SugarCube", { State: { variables: story, temporary } });
    expect(getStore("story")).toBe(story);
    expect(getStore("temporary")).toBe(temporary);
  });

  it("distinguishes references and previews primitive and collection values", () => {
    expect(isReference(null)).toBe(false);
    expect(isReference(1)).toBe(false);
    expect(isReference(() => 1)).toBe(true);
    expect(preview([1, 2])).toBe("Array(2)");
    expect(preview(new Map([["x", 1]]))).toBe("Map(1)");
    expect(preview(new Set([1]))).toBe("Set(1)");
    expect(preview(undefined)).toBe("undefined");
  });
});
