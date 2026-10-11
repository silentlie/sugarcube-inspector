// @vitest-environment happy-dom

vi.mock("wxt/browser", () => ({
  browser: new Proxy({}, {
    get(_target, key: string) {
      const fake = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
      return fake[key];
    },
  }),
}));


import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../entrypoints/sidepanel/App";

const tab = { id: 42, url: "file:///game.html", title: "SugarCube story" };
const session = {
  status: "connected" as const,
  tabId: 42,
  sessionId: "session-1",
  revision: 0,
  roots: [
    { kind: "own" as const, name: "story", value: { type: "object", objectId: "story-root", description: "Object" } },
    { kind: "own" as const, name: "temporary", value: { type: "object", objectId: "temp-root", description: "Object" } },
  ],
};

const queryTab = vi.fn(async () => [tab]);

const respond = vi.fn(async (request: { type: string }) => {
  if (request.type === "inspector:connect") return { ok: true, data: session };
  if (request.type === "inspector:disconnect") {
    return { ok: true, data: { status: "disconnected", tabId: 42 } };
  }
  if (request.type === "inspector:properties") {
    return { ok: true, data: { status: "properties", properties: [
      { name: "health", kind: "own", value: { type: "number", value: 100 } },
      { name: "percent", kind: "own", getter: true },
    ] } };
  }
  return { ok: true, data: { status: "disconnected", tabId: 42 } };
});

let onMessage: ((message: unknown) => void) | undefined;

beforeEach(() => {
  respond.mockClear();
  queryTab.mockClear();
  onMessage = undefined;
  vi.stubGlobal("chrome", {
    tabs: {
      query: queryTab,
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      sendMessage: respond,
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => { onMessage = listener; }),
        removeListener: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CDP side panel proof of concept", () => {
  it("connects, expands live objects, and manually disconnects", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Connect" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Live variables" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand story" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("heading", { name: "Live variables" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Expand story" }));
    expect(await screen.findByText("health")).toBeDefined();
    expect(screen.getByText("[Getter]")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDefined();
      expect(screen.getByText(/You can now open Chrome DevTools/)).toBeDefined();
    });
    expect(respond).toHaveBeenCalledWith({ type: "inspector:disconnect", tabId: 42 });
    expect(screen.queryByRole("heading", { name: "Live variables" })).toBeNull();
    expect(screen.queryByText("health")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("heading", { name: "Live variables" })).toBeDefined();
    // A new inspector tree mounts from the new session, with no cached expansions.
    expect(screen.queryByText("health")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand story" })).toBeDefined();
  });

  it("unmounts remote nodes if DevTools detaches unexpectedly", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Connect" });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: "Live variables" });

    await act(async () => {
      onMessage?.({
        type: "inspector:sessionEnded",
        tabId: 42,
        reason: "Chrome DevTools opened or debugging was cancelled.",
      });
    });

    expect(screen.queryByRole("heading", { name: "Live variables" })).toBeNull();
    expect(screen.getByText(/Chrome DevTools opened or debugging was cancelled/)).toBeDefined();
  });

  it("does not attach to a non-local tab", async () => {
    queryTab.mockResolvedValueOnce([{ ...tab, url: "https://example.com/" }]);
    render(<App />);
    await screen.findByRole("button", { name: "Connect" });
    expect(screen.getByRole("button", { name: "Connect" }).hasAttribute("disabled")).toBe(true);
    expect(respond).not.toHaveBeenCalledWith(expect.objectContaining({ type: "inspector:connect" }));
  });
});
