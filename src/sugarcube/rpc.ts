import { defineCustomEventMessaging } from "@webext-core/messaging/page";
import type { SugarCubeSnapshot } from "./types";
import type { WatchRequest, WatchResponse } from "./watch/types";

export interface SugarCubeRPC {
  bridgeReady(): true;
  getSnapshot(): SugarCubeSnapshot;
  passageChanged(): void;
  getWatchChanges(request: WatchRequest): WatchResponse;
}

export const sugarcubeRPC = defineCustomEventMessaging<SugarCubeRPC>({
  namespace: "sugarcube-inspector:rpc:v1",
});
