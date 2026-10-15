import { theme } from "antd";
import { themes } from "prism-react-renderer";
import { describe, expect, it } from "vitest";
import { antdTheme } from "./antd";
import { prismTheme } from "./prism";

describe("independent theme configurations", () => {
  it("keeps Ant Design's dark and compact algorithms", () => {
    expect(antdTheme.algorithm).toEqual([
      theme.darkAlgorithm,
      theme.compactAlgorithm,
    ]);
  });

  it("uses Prism's original VS Dark palette without overrides", () => {
    expect(prismTheme).toBe(themes.vsDark);
  });
});
