import { describe, expect, it, vi } from "vitest";
import { detectSugarCube } from "./detectSugarCube";

describe("DevTools SugarCube detection", () => {
  it.each([true, false])("accepts a boolean evaluation result (%s)", async detected => {
    const evaluate = vi.fn(async () => detected);
    await expect(detectSugarCube(evaluate)).resolves.toBe(detected);
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(
      "Boolean(globalThis.SugarCube && globalThis.SugarCube.State)",
    );
  });

  it.each([true, false])("accepts legacy two-item results (%s)", async detected => {
    await expect(detectSugarCube(async () => [detected, undefined])).resolves.toBe(detected);
  });

  it.each([true, false])("accepts Chrome 151+ result objects (%s)", async detected => {
    await expect(detectSugarCube(async () => ({ result: detected })))
      .resolves.toBe(detected);
  });

  it("reports evaluation exceptions for either API format", async () => {
    await expect(detectSugarCube(async () => [
      undefined, { isException: true, value: "ReferenceError: test" },
    ])).rejects.toThrow("DevTools evaluation failed: ReferenceError: test");
    await expect(detectSugarCube(async () => ({
      result: undefined, exceptionInfo: { isError: true, code: "E_NOTFOUND" },
    }))).rejects.toThrow("DevTools evaluation failed: E_NOTFOUND");
  });

  it("rejects unrelated response types", async () => {
    await expect(detectSugarCube(async () => ({ detected: true })))
      .rejects.toThrow("Unexpected DevTools evaluation response.");
  });
});
