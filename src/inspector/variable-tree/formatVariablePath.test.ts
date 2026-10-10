import { describe, expect, it } from "vitest";
import { formatVariablePath } from "./formatVariablePath";

describe("circular-reference path labels", () => {
  it("formats scope roots, nested properties, and special keys", () => {
    expect(formatVariablePath("story", [])).toBe("$");
    expect(formatVariablePath("temporary", [{ type: "property", key: "choice" }]))
      .toBe("_choice");
    expect(formatVariablePath("story", [
      { type: "property", key: "player" },
      { type: "property", key: "a.b" },
      { type: "property", key: "2" },
    ])).toBe('$player["a.b"]["2"]');
  });
});

