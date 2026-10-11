import { describe, expect, it, vi } from "vitest";
import {
  callbackDone,
  callbackResult,
  createRefreshMessageHandler,
  evaluateWithCallback,
} from "./callbackApi";

describe("callback-based Chrome DevTools compatibility", () => {
  it("waits for createSidebarPane callbacks on browsers without promises", async () => {
    let complete: ((pane: { name: string }) => void) | undefined;
    const pending = callbackResult<{ name: string }>((done) => { complete = done; });
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    complete?.({ name: "SugarCube Story" });
    await expect(pending).resolves.toEqual({ name: "SugarCube Story" });
  });

  it("waits for setExpression and panel creation callbacks", async () => {
    let complete: (() => void) | undefined;
    const pending = callbackDone((done) => { complete = done; });
    complete?.();
    await expect(pending).resolves.toBeUndefined();
  });

  it("accepts old two-argument DevTools evaluation callbacks", async () => {
    await expect(evaluateWithCallback((done) => done(true))).resolves.toBe(true);
    await expect(evaluateWithCallback((done) => done(undefined, {
      isException: true, value: "bad expression",
    }))).resolves.toEqual([undefined, { isException: true, value: "bad expression" }]);
  });

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
