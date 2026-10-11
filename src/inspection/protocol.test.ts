import { describe, expect, it } from "vitest";
import { isRequest } from "./protocol";

describe("inspector request types", () => {
  it("accepts connect, status, refresh and bounded inspect", () => {
    expect(isRequest({ type: "inspector:connect", tabId: 1 })).toBe(true);
    expect(isRequest({ type: "inspector:status" })).toBe(true);
    expect(isRequest({ type: "inspector:refresh" })).toBe(true);
    expect(isRequest({ type: "inspector:inspect", target: {
      kind: "path", path: { root: "story", segments: [] },
    }, offset: 0 })).toBe(true);
  });
  it("rejects invalid messages", () => {
    expect(isRequest(null)).toBe(false);
    expect(isRequest({ type: "inspector:connect", tabId: -1 })).toBe(false);
    expect(isRequest({ type: "inspector:inspect", target: {}, offset: -2 })).toBe(false);
    expect(isRequest({ type: "legacy:getSnapshot" })).toBe(false);
  });
});
