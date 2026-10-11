export type Scope = "story" | "temporary";
export type Segment =
  | { kind: "property"; key: string }
  | { kind: "symbol"; index: number }
  | { kind: "mapKey" | "mapValue" | "setValue"; index: number };
export type Path = { root: Scope; segments: Segment[] };
export type Target =
  | { kind: "path"; path: Path }
  | { kind: "remote"; sessionId: string; objectId: string };
export type InspectorMode = { mode: "main" | "cdp"; sessionId?: string };
export type Entry = {
  name: string;
  preview: string;
  expandable: boolean;
  target?: Target;
  nonEnumerable?: boolean;
  category?: "own" | "internal" | "private";
};
export type Inspection = { entries: Entry[]; total: number; offset: number };
export type Request =
  | { type: "inspector:status"; tabId?: number }
  | { type: "inspector:connect"; tabId: number }
  | { type: "inspector:disconnect"; tabId: number }
  | { type: "inspector:inspect"; target: Target; offset: number }
  | { type: "inspector:refresh" };
export type Reply =
  | { ok: true; data: InspectorMode | Inspection }
  | { ok: false; error: string };
export type ModeNotice = { type: "inspector:mode"; mode: InspectorMode };

export function isRequest(value: unknown): value is Request {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "inspector:status":
      return v.tabId === undefined || (typeof v.tabId === "number" && Number.isInteger(v.tabId));
    case "inspector:connect":
    case "inspector:disconnect":
      return typeof v.tabId === "number" && Number.isInteger(v.tabId) && v.tabId >= 0;
    case "inspector:inspect":
      return typeof v.offset === "number" && Number.isSafeInteger(v.offset) &&
        v.offset >= 0 && v.offset <= 100000 &&
        typeof v.target === "object" && v.target !== null;
    case "inspector:refresh": return true;
    default: return false;
  }
}
