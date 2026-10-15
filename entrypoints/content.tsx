import { StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, theme } from "antd";
import Drawer from "@/src/inspector/Drawer";
import DirectInspector from "@/src/inspector/DirectInspector";
import ReactDOM from "react-dom/client";
import tailwindStyles from "@/src/styles/tailwind.css?inline";

/** The inspector runs in SugarCube's MAIN world, isolated by its ShadowRoot. */
export default defineContentScript({
  matches: ["file:///*"],
  cssInjectionMode: "manual",
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
    baseline.dataset.inspectorStyles = "tailwind";
    baseline.textContent = tailwindStyles;
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
