/** Serializable messages between the side panel and the extension debugger service. */
export type RemoteValue = {
  type: string;
  subtype?: string;
  className?: string;
  description?: string;
  objectId?: string;
  value?: unknown;
  unserializableValue?: string;
};

export type RemoteProperty = {
  name: string;
  kind: "own" | "internal" | "private";
  value?: RemoteValue;
  getter?: boolean;
  setter?: boolean;
  enumerable?: boolean;
  writable?: boolean;
  configurable?: boolean;
};

export type InspectorSession = {
  status: "connected";
  tabId: number;
  sessionId: string;
  revision: number;
  roots: RemoteProperty[];
};

export type InspectorDisconnected = {
  status: "disconnected";
  tabId: number;
};

export type InspectorProperties = {
  status: "properties";
  properties: RemoteProperty[];
};

export type InspectorData = InspectorSession | InspectorDisconnected | InspectorProperties;

export type InspectorRequest =
  | { type: "inspector:status"; tabId: number }
  | { type: "inspector:connect"; tabId: number }
  | { type: "inspector:disconnect"; tabId: number }
  | { type: "inspector:refresh"; tabId: number; sessionId: string }
  | { type: "inspector:properties"; tabId: number; sessionId: string; objectId: string };

export type InspectorReply =
  | { ok: true; data: InspectorData }
  | { ok: false; error: string };

export type InspectorSessionEnded = {
  type: "inspector:sessionEnded";
  tabId: number;
  reason: string;
};

export function isInspectorRequest(input: unknown): input is InspectorRequest {
  if (typeof input !== "object" || input === null) return false;
  const request = input as Record<string, unknown>;
  if (typeof request.tabId !== "number" ||
      !Number.isSafeInteger(request.tabId) || request.tabId < 0) return false;
  switch (request.type) {
    case "inspector:status":
    case "inspector:connect":
    case "inspector:disconnect":
      return true;
    case "inspector:refresh":
      return typeof request.sessionId === "string";
    case "inspector:properties":
      return typeof request.sessionId === "string" && typeof request.objectId === "string";
    default:
      return false;
  }
}
