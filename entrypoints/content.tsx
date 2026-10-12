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
