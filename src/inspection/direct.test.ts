import { afterEach, describe, expect, it, vi } from "vitest";
import { getState, getStore, hasState } from "./direct";
import { readLocation, readVariable } from "./variableLocation";

afterEach(() => vi.unstubAllGlobals());

describe("direct MAIN-world access", () => {
  it("waits for State and makes ready access a runtime invariant", () => {
    expect(hasState()).toBe(false);
    expect(getState).toThrow("SugarCube.State is not available");

    const state = { variables: { player: 1 }, temporary: { choice: "north" } };
    vi.stubGlobal("SugarCube", { State: state });
    expect(hasState()).toBe(true);
    expect(getState()).toBe(state);
  });

  it("returns the live story and temporary stores without cloning them", () => {
    const story = { player: { health: 100 } };
    const temporary = { choice: "north" };
    vi.stubGlobal("SugarCube", { State: { variables: story, temporary } });
    expect(getStore("variables")).toBe(story);
    expect(getStore("temporary")).toBe(temporary);
  });

  it("reads the State location getters but not arbitrary object getters", () => {
    const story = { health: 12 };
    const getter = vi.fn(() => story);
    vi.stubGlobal("SugarCube", {
      State: { get variables() { return getter(); }, temporary: {} },
    });
    expect(readLocation({ kind: "state", key: "variables" }))
      .toEqual({ kind: "value", value: story });
    expect(readVariable({ kind: "state", key: "variables" }))
      .toMatchObject({ kind: "value", value: story });
    expect(getter).toHaveBeenCalledTimes(2);
    const other = { get secret() { throw new Error("Should never run"); } };
    expect(readVariable({ kind: "property", owner: other, key: "secret" }))
      .toEqual({ kind: "accessor", accessor: "getter" });
  });
});
