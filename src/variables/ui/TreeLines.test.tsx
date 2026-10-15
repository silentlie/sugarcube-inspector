// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Tree } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("variable tree branch connectors", () => {
  it("preserves native leaf connectors at every depth", () => {
    const html = renderToStaticMarkup(
      <Tree
        className="sugarcube-variable-tree"
        virtual={false}
        showLine={{ showLeafIcon: false }}
        expandedKeys={["parent"]}
        treeData={[
          { key: "root-leaf", title: "root leaf", isLeaf: true },
          {
            key: "parent",
            title: "parent",
            children: [{ key: "nested-leaf", title: "nested leaf", isLeaf: true }],
          },
        ]}
      />,
    );
    const host = document.createElement("div");
    host.innerHTML = html;

    const leafLines = host.querySelectorAll(".ant-tree-switcher-leaf-line");
    expect(leafLines).toHaveLength(2);

    const css = readFileSync(resolve("src/styles/tailwind.css"), "utf8");
    expect(css).not.toContain(".ant-tree-switcher-leaf-line {");
    expect(css).not.toContain("visibility: hidden;");

    // Ant's leaf-line pseudo-elements use the switcher's full height to form
    // continuous elbows; only the interactive chevrons may be flex-centered.
    expect(css).toContain(
      ".sugarcube-variable-tree .ant-tree-switcher:not(.ant-tree-switcher-noop) {",
    );
    expect(css).not.toContain(".sugarcube-variable-tree .ant-tree-switcher {");
    expect(css).not.toContain("align-self: center;");
  });
});
