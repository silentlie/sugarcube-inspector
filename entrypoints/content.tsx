import Drawer from "@/src/inspector/Drawer";
import InspectorContent from "@/src/inspector/InspectorContent";
import { InspectorProvider } from "@/src/inspector/InspectorContext";
import "@/src/styles/tailwind.css";

import ReactDOM from "react-dom/client";

const DRAWER_WIDTH = 380;

export default defineContentScript({
  matches: ["file:///*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const storyData = document.querySelector(
      'tw-storydata[format="SugarCube"]',
    );

    if (!storyData) return;

    const ui = await createShadowRootUi(ctx, {
      name: "sugarcube-inspector",
      position: "overlay",
      alignment: "top-right",
      zIndex: 2147483647,

      onMount(container) {
        const root = ReactDOM.createRoot(container);

        root.render(
          <Drawer initialWidth={DRAWER_WIDTH}>
            <InspectorProvider>
              <InspectorContent />
            </InspectorProvider>
          </Drawer>,
        );

        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
