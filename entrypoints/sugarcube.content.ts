import { sugarcubeRPC } from "@/src/sugarcube/rpc";
import { createSugarCubeSnapshot } from "@/src/sugarcube/snapshot";
import { WatchService } from "@/src/sugarcube/watch/WatchService";
import type {} from "twine-sugarcube";

export default defineContentScript({
  matches: ["file:///*"],
  world: "MAIN",
  runAt: "document_end",

  main() {
    if (typeof $ !== "function") {
      throw new Error("[SugarCube Inspector] jQuery is unavailable.");
    }

    if (typeof SugarCube === "undefined") {
      throw new Error("[SugarCube Inspector] SugarCube is unavailable.");
    }

    const watchService = new WatchService();

    sugarcubeRPC.onMessage("getWatchChanges", ({ data }) =>
      watchService.poll(data, {
        story: SugarCube.State.variables,
        temporary: SugarCube.State.temporary,
      }),
    );

    sugarcubeRPC.onMessage("getSnapshot", () => {
      const snapshot = structuredClone(createSugarCubeSnapshot(SugarCube));
      const watchGeneration = watchService.capture(snapshot);
      return { ...snapshot, watchGeneration };
    });

    $(document).on(":passageend.sugarcubeInspector", () => {
      void sugarcubeRPC
        .sendMessage("passageChanged", undefined)
        .catch((error: unknown) => {
          console.error(
            "[SugarCube Inspector] Passage notification failed:",
            error,
          );
        });
    });

    // Register only after successful initialisation.
    sugarcubeRPC.onMessage("bridgeReady", () => true);
  },
});
