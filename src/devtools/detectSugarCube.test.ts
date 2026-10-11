import { describe, expect, it, vi } from "vitest";
import { detectSugarCube } from "./detectSugarCube";

describe("DevTools SugarCube detection", () => {
  it.each([true, false])("accepts Chrome's direct boolean result (%s)", async detected => {
    const evaluate = vi.fn(async () => detected);
    await expect(detectSugarCube(evaluate)).resolves.toBe(detected);
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(
      "Boolean(globalThis.SugarCube && globalThis.SugarCube.State)",
    );
  });

  it.each([true, false])("also accepts WebExtensions' result tuple (%s)", async detected => {
    await expect(detectSugarCube(async () => [detected, undefined])).resolves.toBe(detected);
  });

  it("shows evaluation exceptions instead of treating them as absent SugarCube", async () => {
    await expect(detectSugarCube(async () => [
      undefined, { isException: true, value: "ReferenceError: test" },
    ])).rejects.toThrow("DevTools evaluation failed: ReferenceError: test");
  });

  it("rejects unexpected response types", async () => {
    await expect(detectSugarCube(async () => ({ detected: true })))
      .rejects.toThrow("Unexpected DevTools evaluation response.");
  });
});
