import { describe, expect, it } from "vitest";
import { isInspectorRequest } from "./protocol";

describe("inspector request validation", () => {
  it("recognizes valid commands", () => {
    expect(isInspectorRequest({ type: "inspector:connect", tabId: 4 })).toBe(true);
    expect(isInspectorRequest({ type: "inspector:refresh", tabId: 4, sessionId: "x" })).toBe(true);
    expect(isInspectorRequest({ type: "inspector:properties", tabId: 4, sessionId: "x", objectId: "y" })).toBe(true);
  });

  it("rejects arbitrary runtime messages and malformed requests", () => {
    expect(isInspectorRequest({ type: "other", tabId: 4 })).toBe(false);
    expect(isInspectorRequest({ type: "inspector:connect", tabId: -1 })).toBe(false);
    expect(isInspectorRequest({ type: "inspector:properties", tabId: 4, sessionId: "x" })).toBe(false);
    expect(isInspectorRequest(null)).toBe(false);
  });
});
