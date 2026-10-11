import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
  InspectRequest, Inspection, InspectorMode, StatusRequest, TabRequest,
} from "./protocol";

interface InspectionMessages {
  "inspector:status"(data: StatusRequest): InspectorMode;
  "inspector:connect"(data: TabRequest): InspectorMode;
  "inspector:disconnect"(data: TabRequest): InspectorMode;
  "inspector:refresh"(): InspectorMode;
  "inspector:inspect"(data: InspectRequest): Inspection;
  "inspector:mode"(data: { mode: InspectorMode; tabId: number }): void;
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<InspectionMessages>();
