import { describe, expect, it } from "vitest";
import { parseVariablePath } from "./search";

describe("direct variable paths", () => {
  it("preserves case and decodes property and array keys", () => {
    expect(parseVariablePath(String.raw`$Player.items[0]["a\"b"]`)).toEqual({
      root: "variables", path: ["Player", "items", "0", 'a"b'],
    });
    expect(parseVariablePath('_choice')).toEqual({ root: "temporary", path: ["choice"] });
    expect(parseVariablePath('$["odd root"]')).toEqual({ root: "variables", path: ["odd root"] });
  });
  it("rejects expressions and incomplete paths", () => {
    for (const input of ["$", "$x()", "$x[other]", "$x[-1]", "$x.", '$x["unterminated]', "$x + 1"]) {
      expect(parseVariablePath(input), input).toBeUndefined();
    }
  });
});
