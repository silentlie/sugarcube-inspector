// @vitest-environment happy-dom

import { defineCustomEventMessaging } from "@webext-core/messaging/page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import bridge from "../../entrypoints/sugarcube.content";
import { sugarcubeRPC, type SugarCubeRPC } from "../../src/sugarcube/rpc";
import { SugarCubeSnapshotSchema, type SugarCubeSnapshot } from "../../src/sugarcube/types";
import { withTimeout } from "../../src/utils/withTimeout";
import { createSnapshotFixture, createSugarCubeFixture } from "../fixtures";

type Messenger = ReturnType<typeof defineCustomEventMessaging<SugarCubeRPC>>;

describe("real SugarCube RPC transport", () => {
  const clients: Messenger[] = [];
  let context: ContentScriptContext;
  let client: Messenger;
  let cube: ReturnType<typeof createSugarCubeFixture>;
  let passageEnd: () => void;

  function createClient(namespace = "sugarcube-inspector:rpc:v1") {
    const messenger = defineCustomEventMessaging<SugarCubeRPC>({ namespace });
    clients.push(messenger);
    return messenger;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sugarcubeRPC.removeAllListeners();
    cube = createSugarCubeFixture();
    vi.stubGlobal("SugarCube", cube);
    vi.stubGlobal("$", () => ({
      on: (_event: string, listener: () => void) => { passageEnd = listener; },
    }));
    context = new ContentScriptContext("rpc-integration-test");
    client = createClient();
  });

  afterEach(() => {
    context.notifyInvalidated();
    sugarcubeRPC.removeAllListeners();
    for (const messenger of clients) messenger.removeAllListeners();
    clients.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("exchanges readiness and a validated snapshot with the production bridge", async () => {
    bridge.main(context);

    await expect(withTimeout(client.sendMessage("bridgeReady", undefined))).resolves.toBe(true);
    const snapshot = SugarCubeSnapshotSchema.parse(
      await withTimeout(client.sendMessage("getSnapshot", undefined)),
    );

    expect(snapshot.story.name).toBe("Test Story");
    expect(snapshot.passage.name).toBe("Start");
    expect(snapshot.variables.story).toHaveProperty("score", 7);
    expect(snapshot.variables.story).not.toBe(cube.State.variables);
    Object.assign(snapshot.variables.story, { score: 99 });
    expect(cube.State.variables.score).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("delivers a passage notification and fetches the updated state", async () => {
    bridge.main(context);
    const updated = Promise.withResolvers<SugarCubeSnapshot>();
    const listener = vi.fn(async () => {
      updated.resolve(await client.sendMessage("getSnapshot", undefined));
    });
    client.onMessage("passageChanged", listener);
    cube.State.passage = "Next Passage";
    cube.State.variables.score = 12;
    cube.State.temporary.choice = "south";

    passageEnd();
    const snapshot = SugarCubeSnapshotSchema.parse(await withTimeout(updated.promise));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot.passage.name).toBe("Next Passage");
    expect(snapshot.variables.story).toHaveProperty("score", 12);
    expect(snapshot.variables.temporary.choice).toBe("south");
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves cycles and collections while isolating snapshot data", async () => {
    const variables = cube.State.variables;
    variables.self = variables;
    variables.inventory = new Set(["map"]);
    variables.stats = new Map([["score", 7]]);
    bridge.main(context);

    const snapshot = await withTimeout(client.sendMessage("getSnapshot", undefined));
    const cloned = snapshot.variables.story;

    expect(cloned).not.toBe(variables);
    expect(cloned).toHaveProperty("self", cloned);
    expect(cloned).toHaveProperty("inventory", new Set(["map"]));
    expect(cloned).toHaveProperty("stats", new Map([["score", 7]]));
  });

  it("propagates a snapshot handler failure through the real transport", async () => {
    vi.spyOn(cube.Story, "get").mockImplementation(() => { throw new Error("Passage unavailable"); });
    bridge.main(context);

    await expect(withTimeout(client.sendMessage("getSnapshot", undefined))).rejects.toMatchObject({
      name: "Error", message: "Passage unavailable",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates an uncloneable variable failure through the real transport", async () => {
    cube.State.variables.callback = () => {};
    bridge.main(context);

    await expect(withTimeout(client.sendMessage("getSnapshot", undefined))).rejects.toMatchObject({
      name: "DataCloneError",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("matches concurrent responses to their requests when they arrive out of order", async () => {
    const older = Promise.withResolvers<SugarCubeSnapshot>();
    const newer = Promise.withResolvers<SugarCubeSnapshot>();
    const responses = [older, newer];
    const handler = vi.fn(() => responses.shift()!.promise);
    sugarcubeRPC.onMessage("getSnapshot", handler);
    const first = client.sendMessage("getSnapshot", undefined);
    const second = client.sendMessage("getSnapshot", undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);

    const newest = createSnapshotFixture("Newest");
    newer.resolve(newest);
    await expect(second).resolves.toEqual(newest);

    const previous = createSnapshotFixture("Previous");
    older.resolve(previous);
    await expect(first).resolves.toEqual(previous);
  });

  it("does not accept readiness responses from a different namespace", async () => {
    bridge.main(context);
    const otherClient = createClient("another-extension:rpc");
    const result = withTimeout(otherClient.sendMessage("bridgeReady", undefined), 25);
    const rejection = expect(result).rejects.toThrow("Operation timed out after 25ms");

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    await expect(client.sendMessage("bridgeReady", undefined)).resolves.toBe(true);
  });

  it("times out readiness when bridge initialization failed", async () => {
    vi.stubGlobal("SugarCube", undefined);
    expect(() => bridge.main(context)).toThrow("SugarCube is unavailable");
    const result = withTimeout(client.sendMessage("bridgeReady", undefined), 25);
    const rejection = expect(result).rejects.toThrow("Operation timed out after 25ms");

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("removes response listeners after replies and subscriptions on teardown", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    bridge.main(context);
    const unsubscribe = client.onMessage("passageChanged", () => {});

    await client.sendMessage("bridgeReady", undefined);
    await client.sendMessage("getSnapshot", undefined);
    unsubscribe();
    client.removeAllListeners();
    sugarcubeRPC.removeAllListeners();

    const registrations = add.mock.calls.filter(([name]) => name.startsWith("@webext-core/messaging/"));
    expect(registrations.length).toBeGreaterThanOrEqual(4);
    for (const [name, listener] of registrations) {
      expect(remove).toHaveBeenCalledWith(name, listener);
    }
  });

  it("removes an unanswered response listener when the messenger is torn down", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const result = withTimeout(client.sendMessage("bridgeReady", undefined), 25);
    const rejection = expect(result).rejects.toThrow("Operation timed out after 25ms");
    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    client.removeAllListeners();

    const registrations = add.mock.calls.filter(([name]) => name.startsWith("@webext-core/messaging/"));
    expect(registrations).toHaveLength(1);
    for (const [name, listener] of registrations) {
      expect(remove).toHaveBeenCalledWith(name, listener);
    }
  });
});
