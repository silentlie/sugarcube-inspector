import { describe, expect, it } from "vitest";
import {
  InspectRequestSchema, StatusRequestSchema, TabRequestSchema,
} from "./protocol";

describe("inspector request validation", () => {
  it("accepts valid requests", () => {
    expect(StatusRequestSchema.safeParse({}).success).toBe(true);
    expect(TabRequestSchema.safeParse({ tabId: 1 }).success).toBe(true);
    expect(InspectRequestSchema.safeParse({
      target: { kind: "path", path: { root: "story", segments: [] } },
      offset: 0,
    }).success).toBe(true);
  });

  it("rejects malformed tabs, offsets and nested targets", () => {
    expect(TabRequestSchema.safeParse({ tabId: -1 }).success).toBe(false);
    expect(StatusRequestSchema.safeParse({ tabId: -1 }).success).toBe(false);
    expect(InspectRequestSchema.safeParse({
      target: { kind: "path", path: { root: "invalid", segments: [] } },
      offset: 0,
    }).success).toBe(false);
    expect(InspectRequestSchema.safeParse({
      target: { kind: "path", path: { root: "story", segments: [] } },
      offset: -2,
    }).success).toBe(false);
    expect(InspectRequestSchema.safeParse({
      target: { kind: "remote", objectId: "object" },
      offset: 0,
    }).success).toBe(false);
  });
});
