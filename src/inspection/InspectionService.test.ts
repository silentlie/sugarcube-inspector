import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerInspectionService } from "./InspectionService";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (message: {
    data: any;
    sender: { tab?: { id: number } };
  }) => unknown>(),
  mode: vi.fn(() => ({ mode: "main" as const })),
  connect: vi.fn(async () => ({ mode: "cdp" as const, sessionId: "test" })),
  disconnect: vi.fn(async () => ({ mode: "main" as const })),
  reset: vi.fn(async () => ({ mode: "cdp" as const, sessionId: "next" })),
  inspect: vi.fn(async () => ({ entries: [], total: 0, offset: 0 })),
  executeScript: vi.fn(async () => [{
    result: JSON.stringify({ entries: [], total: 0, offset: 0 }),
  }]),
  send: vi.fn(async () => {}),
}));

vi.mock("./messaging", () => ({
  onMessage: vi.fn((type: string, handler: (message: any) => unknown) => {
    mocks.handlers.set(type, handler);
    return () => { mocks.handlers.delete(type); };
  }),
  sendMessage: mocks.send,
}));

vi.mock("./DebuggerBackend", () => ({
  DebuggerBackend: class {
    getMode = mocks.mode;
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    reset = mocks.reset;
    inspect = mocks.inspect;
  },
}));

vi.mock("wxt/browser", () => ({
  browser: { scripting: { executeScript: mocks.executeScript } },
}));

async function dispatch(
  type: string,
  data: unknown,
  tabId?: number,
): Promise<unknown> {
  const handler = mocks.handlers.get(type);
  if (!handler) throw new Error(`No handler for ${type}`);
  return handler({ data, sender: tabId === undefined ? {} : { tab: { id: tabId } } });
}

beforeEach(() => {
  mocks.handlers.clear();
  vi.clearAllMocks();
  registerInspectionService();
});

describe("inspection extension messaging", () => {
  it("routes side-panel status and debugger mode requests", async () => {
    expect(await dispatch("inspector:status", { tabId: 42 })).toEqual({ mode: "main" });
    expect(mocks.mode).toHaveBeenCalledWith(42);

    await expect(dispatch("inspector:connect", { tabId: 42 })).resolves.toEqual({
      mode: "cdp", sessionId: "test",
    });
    expect(mocks.connect).toHaveBeenCalledWith(42);

    await dispatch("inspector:disconnect", { tabId: 42 });
    expect(mocks.disconnect).toHaveBeenCalledWith(42);
  });

  it("derives content-script tab id from the sender", async () => {
    await dispatch("inspector:refresh", undefined, 23);
    expect(mocks.reset).toHaveBeenCalledWith(23);

    await dispatch("inspector:inspect", {
      target: { kind: "path", path: { root: "story", segments: [] } },
      offset: 0,
    }, 23);
    expect(mocks.executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 23 }, world: "MAIN",
    }));
  });

  it("rejects invalid requests and missing sender tabs", async () => {
    await expect(dispatch("inspector:connect", { tabId: -1 })).rejects.toThrow(
      "Invalid inspector request",
    );
    await expect(dispatch("inspector:inspect", {
      target: { kind: "path" }, offset: -1,
    }, 23)).rejects.toThrow("Invalid inspector request");
    await expect(dispatch("inspector:refresh", undefined)).rejects.toThrow(
      "No inspected game tab was found",
    );
  });
});
