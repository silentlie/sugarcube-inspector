import { defineExtensionMessaging } from "@webext-core/messaging";
import type { Inspection, InspectorMode, Target } from "./protocol";

interface InspectionMessages {
  "inspector:status"(data: { tabId?: number }): InspectorMode;
  "inspector:connect"(data: { tabId: number }): InspectorMode;
  "inspector:disconnect"(data: { tabId: number }): InspectorMode;
  "inspector:refresh"(): InspectorMode;
  "inspector:inspect"(data: { target: Target; offset: number }): Inspection;
  "inspector:mode"(data: { mode: InspectorMode; tabId?: number }): void;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<InspectionMessages>();
