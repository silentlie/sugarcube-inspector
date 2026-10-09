import { defineCustomEventMessaging } from "@webext-core/messaging/page";
import type { SugarCubeSnapshot } from "./types";

export interface SugarCubeRPC {
  bridgeReady(): true;
  getSnapshot(): SugarCubeSnapshot;
  passageChanged(): void;
}

export const sugarcubeRPC = defineCustomEventMessaging<SugarCubeRPC>({
  namespace: "sugarcube-inspector:rpc:v1",
});
