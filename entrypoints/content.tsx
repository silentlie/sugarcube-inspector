import Drawer from "@/src/inspector/Drawer";
import InspectorContent from "@/src/inspector/InspectorContent";
import { InspectorProvider } from "@/src/inspector/InspectorContext";
import "@/src/styles/tailwind.css";
import { sugarcubeRPC } from "@/src/sugarcube/rpc";

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
  let timeoutId: number | undefined;

  try {
    const ready = await Promise.race([
      sugarcubeRPC.sendMessage("bridgeReady", undefined),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("SugarCube RPC bridge did not respond"));
        }, 3000);
      }),
    ]);

    if (ready !== true) {
      throw new Error("Invalid SugarCube RPC readiness response");
    }
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}
