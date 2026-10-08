import {
  CHANNEL,
  isSignal,
  type InspectorMessage,
} from "@/src/sugarcube/protocol";
import { createSugarCubeSnapshot } from "@/src/sugarcube/snapshot";
import type {} from "twine-sugarcube";

export default defineContentScript({
  matches: ["file:///*"],
  world: "MAIN",
  runAt: "document_idle",

  main() {
    function sendSnapshot() {
      if (typeof SugarCube === "undefined") return;

      try {
        window.postMessage(
          {
            channel: CHANNEL,
            type: "snapshot",
            data: createSugarCubeSnapshot(SugarCube),
          } satisfies InspectorMessage,
          "*",
        );
      } catch (error) {
        console.error("[SugarCube Inspector]", error);
      }
    }

    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== window) return;
      if (!isSignal(event.data, "request")) return;

      sendSnapshot();
    }

    // Handle manual refresh requests.
    window.addEventListener("message", handleMessage);

    // Update automatically after passage navigation.
    $(document).on(":passageend.sugarcubeInspector", sendSnapshot);

    // Announce that the main-world bridge is ready.
    window.postMessage(
      {
        channel: CHANNEL,
        type: "ready",
      } satisfies InspectorMessage,
      "*",
    );
  },
});
