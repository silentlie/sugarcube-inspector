import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, theme } from "antd";
import Drawer from "@/src/inspector/Drawer";
import DirectInspector from "@/src/inspector/DirectInspector";
import ReactDOM from "react-dom/client";

/** The inspector runs in SugarCube's MAIN world, isolated by its ShadowRoot. */
export default defineContentScript({
  matches: ["file:///*"],
  world: "MAIN",
  runAt: "document_idle",

  main() {
    if (!document.querySelector('tw-storydata[format="SugarCube"]')) return;
    if (document.querySelector("sugarcube-inspector")) return;

    const host = document.createElement("sugarcube-inspector");
    host.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    const baseline = document.createElement("style");
    baseline.textContent = `
      :host { color-scheme: dark; }
      :host *, :host *::before, :host *::after { box-sizing: border-box; }
      .inspector-tabs {
        display: flex; flex: 1; flex-direction: column; min-height: 0;
      }
      .inspector-tabs > .ant-tabs-nav { flex: none; }
      .inspector-tabs > .ant-tabs-body-holder,
      .inspector-tabs > .ant-tabs-body-holder > .ant-tabs-body,
      .inspector-tabs > .ant-tabs-body-holder > .ant-tabs-body
        > .ant-tabs-content.ant-tabs-content-active {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      .sugarcube-variable-tree {
        height: 100%; display: flex; flex-direction: column;
      }
      .sugarcube-variable-tree > .ant-tree-list {
        flex: 1; min-height: 0; display: flex; flex-direction: column;
      }
      .sugarcube-variable-tree .ant-tree-list-holder {
        flex: 1; min-height: 0;
      }
    `;
    const container = document.createElement("div");
    shadow.append(baseline, container);
    document.documentElement.append(host);

    ReactDOM.createRoot(container).render(
      <StyleProvider container={shadow}>
        <ConfigProvider
          getPopupContainer={() => container}
          theme={{ algorithm: [theme.darkAlgorithm, theme.compactAlgorithm] }}
        >
          <Drawer initialWidth={380}>
            <DirectInspector />
          </Drawer>
        </ConfigProvider>
      </StyleProvider>,
    );
  },
});
