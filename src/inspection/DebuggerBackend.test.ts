import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebuggerBackend } from "./DebuggerBackend";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(async () => {}),
  detach: vi.fn(async () => {}),
  sendCommand: vi.fn(async (_target: { tabId: number }, method: string, params?: { expression?: string }) => {
    if (method === "Runtime.evaluate") {
      if (params?.expression?.startsWith("Boolean")) {
        return { result: { type: "boolean", value: true } };
      }
      return { result: { type: "object", objectId: "root-object", description: "Object" } };
    }
    if (method === "Runtime.getProperties") {
      return {
        result: [
          { name: "day", value: { type: "number", value: 2 }, enumerable: true },
          { name: "player", value: { type: "object", objectId: "player-object", description: "Object" } },
          { name: "computed", get: { type: "function", objectId: "getter" } },
        ],
        internalProperties: [{ name: "[[Prototype]]", value: { type: "object", objectId: "proto" } }],
        privateProperties: [{ name: "#secret", value: { type: "number", value: 5 } }],
      };
    }
    return {};
  }),
  onDetach: vi.fn((_handler: (source: { tabId?: number }) => void) => {}),
  onEvent: vi.fn(),
  getTab: vi.fn(async () => ({ id: 42, url: "file:///story.html" })),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    debugger: {
      attach: mocks.attach,
      detach: mocks.detach,
      sendCommand: mocks.sendCommand,
      onDetach: { addListener: mocks.onDetach },
      onEvent: { addListener: mocks.onEvent },
    },
    tabs: { get: mocks.getTab },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTab.mockResolvedValue({ id: 42, url: "file:///story.html" });
});

afterEach(() => vi.restoreAllMocks());

describe("CDP opt-in inspection", () => {
  it("does not attach until explicitly connected and exposes engine descriptors", async () => {
    const changed = vi.fn();
    const backend = new DebuggerBackend(changed);
    expect(backend.getMode(42)).toEqual({ mode: "main" });
    expect(mocks.attach).not.toHaveBeenCalled();

    const mode = await backend.connect(42);
    expect(mode.mode).toBe("cdp");
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith({ tabId: 42 }, "1.3");
    expect(changed).toHaveBeenCalledExactlyOnceWith(42);

    const result = await backend.inspect(42, {
      kind: "path", path: { root: "story", segments: [] },
    }, 0);
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "day", preview: "2" }),
      expect.objectContaining({ name: "player", expandable: true }),
      expect.objectContaining({ name: "computed", preview: "[Getter]", expandable: false }),
      expect.objectContaining({ name: "#secret", category: "private" }),
      expect.objectContaining({ name: "[[Prototype]]", category: "internal" }),
    ]));

    const player = result.entries.find((property) => property.name === "player");
    expect(player?.target?.kind).toBe("remote");
    await backend.inspect(42, player!.target!, 0);
    await backend.disconnect(42);
    expect(backend.getMode(42)).toEqual({ mode: "main" });
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
    await expect(backend.inspect(42, player!.target!, 0)).rejects.toThrow("Debugger disconnected");
  });

  it("returns to MAIN mode when Chrome detaches unexpectedly", async () => {
    const changed = vi.fn();
    const backend = new DebuggerBackend(changed);
    await backend.connect(42);
    const listener = mocks.onDetach.mock.calls[0]?.[0] as
      | ((source: { tabId: number }) => void)
      | undefined;
    listener?.({ tabId: 42 });
    expect(backend.getMode(42).mode).toBe("main");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("invalidates all old remote handles on refresh", async () => {
    const backend = new DebuggerBackend(vi.fn());
    const first = await backend.connect(42);
    const roots = await backend.inspect(42, {
      kind: "path", path: { root: "story", segments: [] },
    }, 0);
    const player = roots.entries.find((entry) => entry.name === "player")!;
    const reset = await backend.reset(42);
    expect(reset.sessionId).not.toBe(first.sessionId);
    await expect(backend.inspect(42, player.target!, 0))
      .rejects.toThrow("Remote object handle expired");
  });
});
