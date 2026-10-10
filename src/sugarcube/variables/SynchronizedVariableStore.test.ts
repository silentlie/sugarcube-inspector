import { describe, expect, it } from "vitest";
import { SynchronizedVariableStore } from "./SynchronizedVariableStore";
import type { SugarCubeSnapshot } from "../types";
import type { VariablePath } from "../watch/types";

const path: VariablePath = [
  { type: "property", key: "story" },
  { type: "property", key: "score" },
];

function snapshot(score: number): SugarCubeSnapshot {
  return {
    story: { name: "Test", ifId: "test" },
    passage: { name: "Start", tags: [] },
    history: { turns: 0, length: 0 },
    variables: { story: { score }, temporary: {} },
    capturedAt: 0,
  };
}

describe("MAIN synchronized state", () => {
  it("captures generations and advances only with patches", () => {
    const store = new SynchronizedVariableStore();
    expect(store.hasSnapshot).toBe(false);
    expect(store.capture(snapshot(7))).toBe(1);
    expect(store.read(path)).toEqual({ exists: true, value: 7 });
    store.apply([{ op: "set", path, value: 42 }]);
    expect(store.read(path)).toEqual({ exists: true, value: 42 });
    expect(store.capture(snapshot(8))).toBe(2);
    expect(store.read(path)).toEqual({ exists: true, value: 8 });
  });
});
