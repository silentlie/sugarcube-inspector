import Drawer from "@/src/inspector/Drawer";
import DirectInspector from "@/src/inspector/DirectInspector";
import styles from "@/src/styles/tailwind.css?inline";
import ReactDOM from "react-dom/client";

/**
 * React and its SugarCube data layer both execute in the page's MAIN world.
 * Chrome's content-script isolation, RPC and executeScript are not involved.
 */
export default defineContentScript({
  matches: ["file:///*"],
  world: "MAIN",
  runAt: "document_idle",

  main() {
    if (!document.querySelector('tw-storydata[format="SugarCube"]')) return;
    if (document.querySelector("sugarcube-inspector")) return;

    // MAIN scripts do not receive a WXT content-script context. Mount our
    // own Shadow DOM and inline scoped CSS instead of createShadowRootUi().
    const host = document.createElement("sugarcube-inspector");
    host.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    shadow.append(style);

    const container = document.createElement("div");
    shadow.append(container);
    document.documentElement.append(host);

    const root = ReactDOM.createRoot(container);
    root.render(
      <Drawer initialWidth={380}>
        <DirectInspector />
      </Drawer>,
    );
  },
});
