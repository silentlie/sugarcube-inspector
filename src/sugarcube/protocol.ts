import type { SugarCubeSnapshot } from "./types";

export const CHANNEL = "sugarcube-inspector:v1";

export type InspectorMessage =
  | { channel: typeof CHANNEL; type: "ready" }
  | { channel: typeof CHANNEL; type: "request" }
  | {
      channel: typeof CHANNEL;
      type: "snapshot";
      data: SugarCubeSnapshot;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSignal(value: unknown, type: "ready" | "request"): boolean {
  return isRecord(value) && value.channel === CHANNEL && value.type === type;
}

export function isSnapshotMessage(
  value: unknown,
): value is Extract<InspectorMessage, { type: "snapshot" }> {
  if (!isRecord(value)) return false;
  if (value.channel !== CHANNEL || value.type !== "snapshot") {
    return false;
  }

  const data = value.data;
  if (!isRecord(data)) return false;

  const { story, passage, history, variables } = data;

  return (
    isRecord(story) &&
    typeof story.name === "string" &&
    typeof story.ifId === "string" &&
    (story.version === undefined || typeof story.version === "string") &&
    isRecord(passage) &&
    typeof passage.name === "string" &&
    Array.isArray(passage.tags) &&
    passage.tags.every((tag: unknown) => typeof tag === "string") &&
    isRecord(history) &&
    typeof history.turns === "number" &&
    typeof history.length === "number" &&
    isRecord(variables) &&
    Array.isArray(variables.story) &&
    Array.isArray(variables.temporary) &&
    typeof data.capturedAt === "number"
  );
}
