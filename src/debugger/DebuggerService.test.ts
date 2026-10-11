import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DebuggerService } from "./DebuggerService";

type DetachListener = (source: { tabId?: number }, reason: "target_closed" | "canceled_by_user") => void;

let detached: DetachListener | undefined;

const attach = vi.fn(async () => {});
const detach = vi.fn(async () => {});
const sendCommand = vi.fn(async (
  _target: { tabId: number }, method: string, params?: { expression?: string },
) => {
  if (method === "Runtime.evaluate") {
    const name = params?.expression?.includes("temporary") ? "temporary" : "story";
    return { result: { type: "object", objectId: `handle-${name}`, description: "Object" } };
  }
  if (method === "Runtime.getProperties") {
    return {
      result: [
        { name: "health", value: { type: "number", value: 80 }, enumerable: true },
        { name: "healthPercent", get: { type: "function", objectId: "getter" }, enumerable: true },
      ],
      internalProperties: [{ name: "[[Prototype]]", value: { type: "object", objectId: "proto" } }],
      privateProperties: [{ name: "#secret", value: { type: "number", value: 3 } }],
    };
  }
  return {};
});

beforeEach(() => {
  detached = undefined;
  attach.mockClear();
  detach.mockClear();
  sendCommand.mockClear();
  vi.stubGlobal("chrome", {
    tabs: { get: vi.fn(async () => ({ id: 42, url: "file:///game.html" })) },
    runtime: { sendMessage: vi.fn(async () => {}) },
    debugger: {
      attach, detach, sendCommand,
      onDetach: { addListener: vi.fn((handler: DetachListener) => { detached = handler; }) },
      onEvent: { addListener: vi.fn() },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DebuggerService CDP lifecycle", () => {
  it("connects to SugarCube roots, inspects accessors and private fields, and disconnects", async () => {
    const service = new DebuggerService();
    const connected = await service.connect(42);

    expect(connected.status).toBe("connected");
    expect(connected.roots.map((root) => root.name)).toEqual(["story", "temporary"]);
    expect(attach).toHaveBeenCalledExactlyOnceWith({ tabId: 42 }, "1.3");

    const data = await service.properties(42, connected.sessionId, "handle-story");
    expect(data.status).toBe("properties");
    if (data.status !== "properties") throw new Error("Expected properties");
    expect(data.properties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "health", value: expect.objectContaining({ value: 80 }) }),
      expect.objectContaining({ name: "healthPercent", getter: true }),
      expect.objectContaining({ name: "#secret", kind: "private" }),
      expect.objectContaining({ name: "[[Prototype]]", kind: "internal" }),
    ]));

    await service.disconnect(42);
    expect(detach).toHaveBeenCalledWith({ tabId: 42 });
    expect(service.status(42).status).toBe("disconnected");
    await expect(service.properties(42, connected.sessionId, "handle-story"))
      .rejects.toThrow("session expired");
  });

  it("invalidates remote handles when DevTools takes over", async () => {
    const service = new DebuggerService();
    const connected = await service.connect(42);
    detached?.({ tabId: 42 }, "canceled_by_user");
    expect(service.status(42).status).toBe("disconnected");
    await expect(service.refresh(42, connected.sessionId)).rejects.toThrow("session expired");
  });

  it("releases the old handle group on refresh", async () => {
    const service = new DebuggerService();
    const connected = await service.connect(42);
    const refreshed = await service.refresh(42, connected.sessionId);

    expect(refreshed.sessionId).toBe(connected.sessionId);
    expect(refreshed.revision).toBe(1);
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 42 }, "Runtime.releaseObjectGroup", expect.any(Object));
  });
});
