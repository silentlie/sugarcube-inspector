import Drawer from "@/src/inspector/Drawer";
import InspectorContent from "@/src/inspector/InspectorContent";
import { InspectorProvider } from "@/src/inspector/InspectorContext";
import "@/src/styles/tailwind.css";
import {
  CHANNEL,
  type InspectorMessage,
  isSignal,
  isSnapshotMessage,
} from "@/src/sugarcube/protocol";
import type { SugarCubeSnapshot } from "@/src/sugarcube/types";
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
        let snapshot: SugarCubeSnapshot | null = null;

        function requestSnapshot() {
          window.postMessage(
            {
              channel: CHANNEL,
              type: "request",
            } satisfies InspectorMessage,
            "*",
          );
        }

        function render() {
          root.render(
            <InspectorProvider>
              <Drawer initialWidth={DRAWER_WIDTH}>
                <InspectorContent />
              </Drawer>
            </InspectorProvider>,
          );
        }

        function onMessage(event: MessageEvent<unknown>) {
          if (event.source !== window) return;

          if (isSignal(event.data, "ready")) {
            requestSnapshot();
            return;
          }

          if (isSnapshotMessage(event.data)) {
            snapshot = event.data.data;
            render();
          }
        }

        window.addEventListener("message", onMessage);

        render();
        requestSnapshot();

        return { root, onMessage };
      },

      onRemove(mounted) {
        if (!mounted) return;

        window.removeEventListener("message", mounted.onMessage);
        mounted.root.unmount();
      },
    });

    ui.mount();
  },
});
