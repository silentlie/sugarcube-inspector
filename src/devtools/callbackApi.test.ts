import { describe, expect, it, vi } from "vitest";
import { createRefreshMessageHandler } from "./callbackApi";

describe("DevTools refresh message handling", () => {
  it("explicitly responds to a refresh request and keeps the channel alive", async () => {
    const refresh = vi.fn(async () => {});
    const respond = vi.fn();
    const listener = createRefreshMessageHandler(42, refresh);
    expect(listener({ type: "other", tabId: 42 }, undefined, respond)).toBe(false);
    expect(listener({ type: "sugarcube:refresh", tabId: 42 }, undefined, respond))
      .toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(refresh).toHaveBeenCalledExactlyOnceWith();
  });

  it("replies with errors when sidebar refresh fails", async () => {
    const listener = createRefreshMessageHandler(42, async () => {
      throw new Error("Sidebar unavailable");
    });
    const respond = vi.fn();
    expect(listener({ type: "sugarcube:refresh", tabId: 42 }, undefined, respond))
      .toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({
      ok: false,
      error: "Sidebar unavailable",
    }));
  });
});
