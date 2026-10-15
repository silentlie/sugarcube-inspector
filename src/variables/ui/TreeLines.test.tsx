// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { Tree } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const rootLeafSelector =
  ".sugarcube-variable-tree .ant-tree-indent:empty + .ant-tree-switcher > .ant-tree-switcher-leaf-line";

describe("variable tree branch connectors", () => {
  it("targets only root leaf elbows and preserves nested connectors", () => {
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
    const hiddenRootLines = host.querySelectorAll(rootLeafSelector);
    expect(leafLines).toHaveLength(2);
    expect(hiddenRootLines).toHaveLength(1);
    expect(hiddenRootLines[0].closest(".ant-tree-treenode")?.textContent).toContain("root leaf");

    const css = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
    expect(css).toContain(rootLeafSelector + " {");
  });
});
