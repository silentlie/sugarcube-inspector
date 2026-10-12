import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore, isReference, preview } from "./direct";
import { readVariable } from "./variableLocation";

afterEach(() => vi.unstubAllGlobals());

describe("direct MAIN-world access", () => {
  it("returns the live story and temporary stores without cloning them", () => {
    const story = { player: { health: 100 } };
    const temporary = { choice: "north" };
    vi.stubGlobal("SugarCube", { State: { variables: story, temporary } });
    expect(getStore("variables")).toBe(story);
    expect(getStore("temporary")).toBe(temporary);
    expect(getStore("variables")).toBe(story);
  });

  it("reads the State location getters but not arbitrary object getters", () => {
    const story = { health: 12 };
    const getter = vi.fn(() => story);
    vi.stubGlobal("SugarCube", {
      State: { get variables() { return getter(); }, temporary: {} },
    });
    expect(readVariable({ kind: "state", key: "variables" }).value).toBe(story);
    expect(getter).toHaveBeenCalledTimes(1);
    const other = { get secret() { throw new Error("Should never run"); } };
    expect(readVariable({ kind: "property", owner: other, key: "secret" }).preview)
      .toBe("[getter]");
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
