// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { createSugarCubeFixture } from "../fixtures";
import { SugarCubeSnapshotSchema } from "../../src/sugarcube/types";
import bridge from "../../entrypoints/sugarcube.content";

const rpc = vi.hoisted(() => ({
  onMessage: vi.fn<(type: string, listener: () => unknown) => () => void>(),
  sendMessage: vi.fn<(type: string, data: unknown) => Promise<unknown>>(),
}));

vi.mock("../../src/sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

describe("page bridge initialization", () => {
  let context: ContentScriptContext;
  let cube: ReturnType<typeof createSugarCubeFixture>;
  const on = vi.fn<(event: string, listener: () => void) => void>();
  const jquery = vi.fn(() => ({ on }));

  function handler(type: string) {
    const registration = rpc.onMessage.mock.calls.find(([name]) => name === type);
    expect(registration).toBeDefined();
    return registration![1];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_791_500_000_000);
    rpc.onMessage.mockReset();
    rpc.sendMessage.mockReset();
    rpc.sendMessage.mockResolvedValue(undefined);
    on.mockReset();
    jquery.mockClear();
    cube = createSugarCubeFixture();
    vi.stubGlobal("$", jquery);
    vi.stubGlobal("SugarCube", cube);
    vi.spyOn(console, "error").mockImplementation(() => {});
    context = new ContentScriptContext("page-bridge-test");
  });

  afterEach(() => {
    context.notifyInvalidated();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([undefined, {}, "jQuery"])(
    "does not register readiness when jQuery is unavailable (%s)",
    (value) => {
      vi.stubGlobal("$", value);

      expect(() => bridge.main(context)).toThrow("[SugarCube Inspector] jQuery is unavailable.");

      expect(rpc.onMessage).not.toHaveBeenCalled();
      expect(on).not.toHaveBeenCalled();
    },
  );

  it("does not register any handlers when SugarCube is unavailable", () => {
    vi.stubGlobal("SugarCube", undefined);

    expect(() => bridge.main(context)).toThrow("[SugarCube Inspector] SugarCube is unavailable.");

    expect(rpc.onMessage).not.toHaveBeenCalled();
    expect(jquery).not.toHaveBeenCalled();
  });

  it("registers readiness only after the snapshot and passage handlers", () => {
    on.mockImplementationOnce(() => {
      expect(rpc.onMessage).toHaveBeenCalledExactlyOnceWith("getSnapshot", expect.any(Function));
    });

    bridge.main(context);

    expect(jquery).toHaveBeenCalledExactlyOnceWith(document);
    expect(on).toHaveBeenCalledExactlyOnceWith(":passageend.sugarcubeInspector", expect.any(Function));
    expect(rpc.onMessage).toHaveBeenNthCalledWith(2, "bridgeReady", expect.any(Function));
    expect(handler("bridgeReady")()).toBe(true);
  });

  it("never advertises readiness if passage subscription fails", () => {
    const cause = new Error("Passage subscription failed");
    on.mockImplementationOnce(() => { throw cause; });

    expect(() => bridge.main(context)).toThrow(cause);

    expect(rpc.onMessage).not.toHaveBeenCalledWith("bridgeReady", expect.any(Function));
  });

  it("returns a valid snapshot cloned from the current SugarCube state", () => {
    bridge.main(context);

    const snapshot = SugarCubeSnapshotSchema.parse(handler("getSnapshot")());

    expect(snapshot).toMatchObject({
      story: { name: "Test Story", version: "2.37.3" },
      passage: { name: "Start", tags: ["intro"] },
      history: { turns: 2, length: 2 },
      variables: { story: { score: 7 }, temporary: { choice: "north" } },
      capturedAt: 1_791_500_000_000,
    });
    expect(snapshot.variables.story).not.toBe(cube.State.variables);
    expect(snapshot.variables.temporary).not.toBe(cube.State.temporary);

    Object.assign(snapshot.variables.story, { score: 99 });
    snapshot.variables.temporary.choice = "changed";
    expect(cube.State.variables.score).toBe(7);
    expect(cube.State.temporary.choice).toBe("north");

    cube.State.passage = "Next Passage";
    cube.State.variables.score = 12;
    const next = SugarCubeSnapshotSchema.parse(handler("getSnapshot")());
    expect(next.passage.name).toBe("Next Passage");
    expect(next.variables.story).toHaveProperty("score", 12);
  });

  it("sends a passage notification when SugarCube finishes a passage", async () => {
    bridge.main(context);

    on.mock.calls[0]![1]();
    await vi.advanceTimersByTimeAsync(0);

    expect(rpc.sendMessage).toHaveBeenCalledExactlyOnceWith("passageChanged", undefined);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("handles rejected passage notifications without an unhandled rejection", async () => {
    const cause = new Error("Inspector unavailable");
    rpc.sendMessage.mockRejectedValueOnce(cause);
    bridge.main(context);

    on.mock.calls[0]![1]();
    await vi.advanceTimersByTimeAsync(0);

    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[SugarCube Inspector] Passage notification failed:", cause,
    );
  });
});
