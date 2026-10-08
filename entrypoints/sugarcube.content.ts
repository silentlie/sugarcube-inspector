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
    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (!isSignal(event.data, "request")) return;
      if (typeof SugarCube === "undefined") return;

      try {
        const response = {
          channel: CHANNEL,
          type: "snapshot",
          data: createSugarCubeSnapshot(SugarCube),
        } satisfies InspectorMessage;

        window.postMessage(response, "*");
      } catch (error) {
        console.error("[SugarCube Inspector]", error);
      }
    });

    window.postMessage(
      {
        channel: CHANNEL,
        type: "ready",
      } satisfies InspectorMessage,
      "*",
    );
  },
});
