import Drawer from "@/src/inspector/Drawer";
import InspectorContent from "@/src/inspector/InspectorContent";
import { InspectorProvider } from "@/src/inspector/InspectorContext";
import "@/src/styles/tailwind.css";
import { sugarcubeRPC } from "@/src/sugarcube/rpc";
import { withTimeout } from "@/src/utils/withTimeout";

import ReactDOM from "react-dom/client";

const DRAWER_WIDTH = 380;

export default defineContentScript({
  matches: ["file:///*"],
  cssInjectionMode: "ui",
  runAt: "document_idle",

  async main(ctx) {
    const storyData = document.querySelector(
      'tw-storydata[format="SugarCube"]',
    );

    if (!storyData) return;

    await verifyBridge();

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

async function verifyBridge(): Promise<void> {
  const ready = await withTimeout(
    sugarcubeRPC.sendMessage("bridgeReady", undefined),
  );

  if (ready !== true) {
    throw new Error("Invalid SugarCube RPC readiness response.");
  }
}
