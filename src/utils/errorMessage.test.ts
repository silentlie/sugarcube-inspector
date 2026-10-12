import { describe, expect, it } from "vitest";
import { errorMessage } from "./errorMessage";

describe("error message", () => {
  it("uses the message of an Error", () => {
    expect(errorMessage(new Error("failed"))).toBe("failed");
  });

  it("converts other thrown values to strings", () => {
    expect(errorMessage("failed")).toBe("failed");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(42)).toBe("42");
  });
});
