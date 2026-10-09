// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { createSnapshotFixture } from "../../tests/fixtures";
import { InspectorProvider, useInspector } from "./InspectorContext";

const rpc = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, data: unknown) => Promise<unknown>>(),
  onMessage: vi.fn<(type: string, listener: () => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
}));

vi.mock("../sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

describe("InspectorProvider", () => {
  let passageChanged: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    rpc.sendMessage.mockReset();
    rpc.onMessage.mockReset();
    rpc.unsubscribe.mockReset();
    rpc.onMessage.mockImplementation((_type, listener) => {
      passageChanged = listener;
      return rpc.unsubscribe;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("subscribes before loading, then becomes ready with a validated snapshot", async () => {
    const request = Promise.withResolvers<unknown>();
    const snapshot = createSnapshotFixture();
    rpc.sendMessage.mockImplementationOnce(() => {
      expect(rpc.onMessage).toHaveBeenCalledWith(
        "passageChanged",
        expect.any(Function),
      );
      return request.promise;
    });
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });

    expect(result.current.state).toEqual({ status: "loading", snapshot: null });
    expect(rpc.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "getSnapshot",
      undefined,
    );

    await act(async () => {
      request.resolve(snapshot);
    });

    expect(result.current.state).toEqual({
      status: "ready",
      snapshot,
      refreshing: false,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enters the error state when the initial response fails validation", async () => {
    const request = Promise.withResolvers<unknown>();
    rpc.sendMessage.mockReturnValueOnce(request.promise);
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });

    await act(async () => {
      request.resolve({ ...createSnapshotFixture(), variables: { story: [] } });
    });

    expect(result.current.state).toEqual({
      status: "error",
      snapshot: null,
      error: expect.any(ZodError),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new Error("Bridge unavailable"), "Bridge unavailable"])(
    "converts an initial RPC failure (%s) into an Error",
    async (cause) => {
      const request = Promise.withResolvers<unknown>();
      rpc.sendMessage.mockReturnValueOnce(request.promise);
      const { result } = renderHook(useInspector, { wrapper: InspectorProvider });

      await act(async () => {
        request.reject(cause);
      });

      expect(result.current.state).toEqual({
        status: "error",
        snapshot: null,
        error: expect.any(Error),
      });
      if (result.current.state.status === "error") {
        expect(result.current.state.error.message).toBe("Bridge unavailable");
        if (cause instanceof Error) {
          expect(result.current.state.error).toBe(cause);
        }
      }
      expect(console.error).toHaveBeenCalledExactlyOnceWith(
        "[SugarCube Inspector] Snapshot request failed:",
        cause,
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["manual refresh", "passage change"])(
    "retains the last snapshot during a %s and replaces it on success",
    async (trigger) => {
      const initial = Promise.withResolvers<unknown>();
      const next = Promise.withResolvers<unknown>();
      const snapshot = createSnapshotFixture();
      const nextSnapshot = createSnapshotFixture("Next Passage");
      rpc.sendMessage
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(next.promise);
      const { result } = renderHook(useInspector, { wrapper: InspectorProvider });
      await act(async () => {
        initial.resolve(snapshot);
      });

      act(() => {
        if (trigger === "manual refresh") {
          result.current.refresh();
        } else {
          passageChanged();
        }
      });

      expect(result.current.state).toEqual({
        status: "ready",
        snapshot,
        refreshing: true,
      });
      expect(rpc.sendMessage).toHaveBeenNthCalledWith(
        2,
        "getSnapshot",
        undefined,
      );

      await act(async () => {
        next.resolve(nextSnapshot);
      });

      expect(result.current.state).toEqual({
        status: "ready",
        snapshot: nextSnapshot,
        refreshing: false,
      });
    },
  );

  it.each(["RPC failure", "invalid response"])(
    "retains the last snapshot after a refresh %s and recovers on retry",
    async (failure) => {
      const initial = Promise.withResolvers<unknown>();
      const failed = Promise.withResolvers<unknown>();
      const retry = Promise.withResolvers<unknown>();
      const snapshot = createSnapshotFixture();
      const recovered = createSnapshotFixture("Recovered");
      rpc.sendMessage
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(failed.promise)
        .mockReturnValueOnce(retry.promise);
      const { result } = renderHook(useInspector, { wrapper: InspectorProvider });
      await act(async () => {
        initial.resolve(snapshot);
      });
      act(() => result.current.refresh());

      await act(async () => {
        if (failure === "RPC failure") {
          failed.reject(new Error("Refresh failed"));
        } else {
          failed.resolve({ ...snapshot, history: { turns: -1, length: 2 } });
        }
      });

      expect(result.current.state).toEqual({
        status: "error",
        snapshot,
        error: expect.any(failure === "RPC failure" ? Error : ZodError),
      });

      act(() => result.current.refresh());

      expect(result.current.state).toEqual({
        status: "ready",
        snapshot,
        refreshing: true,
      });

      await act(async () => {
        retry.resolve(recovered);
      });

      expect(result.current.state).toEqual({
        status: "ready",
        snapshot: recovered,
        refreshing: false,
      });
    },
  );

  it("returns to loading when retrying an error without a snapshot", async () => {
    const initial = Promise.withResolvers<unknown>();
    const retry = Promise.withResolvers<unknown>();
    const snapshot = createSnapshotFixture();
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise);
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });
    await act(async () => {
      initial.reject(new Error("Bridge unavailable"));
    });

    act(() => result.current.refresh());

    expect(result.current.state).toEqual({ status: "loading", snapshot: null });

    await act(async () => {
      retry.resolve(snapshot);
    });

    expect(result.current.state).toEqual({
      status: "ready",
      snapshot,
      refreshing: false,
    });
  });

  it("times out the initial load after three seconds and ignores a late response", async () => {
    const request = Promise.withResolvers<unknown>();
    rpc.sendMessage.mockReturnValueOnce(request.promise);
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });

    expect(result.current.state).toEqual({ status: "loading", snapshot: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.state).toEqual({
      status: "error",
      snapshot: null,
      error: new Error("Operation timed out after 3000ms"),
    });
    expect(vi.getTimerCount()).toBe(0);
    const timedOutState = result.current.state;

    await act(async () => {
      request.resolve(createSnapshotFixture("Late Passage"));
    });

    expect(result.current.state).toBe(timedOutState);
  });

  it("retains the last snapshot on a refresh timeout and recovers on retry", async () => {
    const initial = Promise.withResolvers<unknown>();
    const stalled = Promise.withResolvers<unknown>();
    const retry = Promise.withResolvers<unknown>();
    const snapshot = createSnapshotFixture();
    const recovered = createSnapshotFixture("Recovered");
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(stalled.promise)
      .mockReturnValueOnce(retry.promise);
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });
    await act(async () => {
      initial.resolve(snapshot);
    });
    act(() => result.current.refresh());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(result.current.state).toEqual({
      status: "error",
      snapshot,
      error: new Error("Operation timed out after 3000ms"),
    });

    act(() => result.current.refresh());
    await act(async () => {
      retry.resolve(recovered);
    });
    const recoveredState = result.current.state;

    expect(recoveredState).toEqual({
      status: "ready",
      snapshot: recovered,
      refreshing: false,
    });

    await act(async () => {
      stalled.resolve(createSnapshotFixture("Late Passage"));
    });

    expect(result.current.state).toBe(recoveredState);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { outcome: "success", order: "before" },
    { outcome: "failure", order: "before" },
    { outcome: "success", order: "after" },
    { outcome: "failure", order: "after" },
  ])("ignores an older request's $outcome $order the latest request settles", async ({ outcome, order }) => {
    const initial = Promise.withResolvers<unknown>();
    const older = Promise.withResolvers<unknown>();
    const latest = Promise.withResolvers<unknown>();
    const snapshot = createSnapshotFixture();
    const newest = createSnapshotFixture("Newest Passage");
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const { result } = renderHook(useInspector, { wrapper: InspectorProvider });
    await act(async () => {
      initial.resolve(snapshot);
    });
    act(() => result.current.refresh());
    act(() => result.current.refresh());

    const settleOlder = async () => {
      await act(async () => {
        if (outcome === "success") {
          older.resolve(createSnapshotFixture("Stale Passage"));
        } else {
          older.reject(new Error("Stale failure"));
        }
      });
    };

    if (order === "before") {
      await settleOlder();
      expect(result.current.state).toEqual({
        status: "ready",
        snapshot,
        refreshing: true,
      });
    }

    await act(async () => {
      latest.resolve(newest);
    });
    const newestState = result.current.state;

    if (order === "after") {
      await settleOlder();
    }

    expect(result.current.state).toBe(newestState);
    expect(result.current.state).toEqual({
      status: "ready",
      snapshot: newest,
      refreshing: false,
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "failure"])(
    "unsubscribes on unmount and ignores a pending request's %s",
    async (outcome) => {
      const request = Promise.withResolvers<unknown>();
      rpc.sendMessage.mockReturnValueOnce(request.promise);
      const { result, unmount } = renderHook(useInspector, {
        wrapper: InspectorProvider,
      });
      const lastState = result.current.state;

      unmount();

      expect(rpc.unsubscribe).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (outcome === "success") {
          request.resolve(createSnapshotFixture());
        } else {
          request.reject(new Error("Unmounted failure"));
        }
      });

      expect(result.current.state).toBe(lastState);
      expect(console.error).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("survives StrictMode effect cleanup without accepting the discarded request", async () => {
    const discarded = Promise.withResolvers<unknown>();
    const current = Promise.withResolvers<unknown>();
    const snapshot = createSnapshotFixture("Current Passage");
    rpc.sendMessage
      .mockReturnValueOnce(discarded.promise)
      .mockReturnValueOnce(current.promise);
    const { result, unmount } = renderHook(useInspector, {
      wrapper: InspectorProvider,
      reactStrictMode: true,
    });

    expect(rpc.onMessage).toHaveBeenCalledTimes(2);
    expect(rpc.unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      discarded.resolve(createSnapshotFixture("Discarded Passage"));
    });

    expect(result.current.state).toEqual({ status: "loading", snapshot: null });

    await act(async () => {
      current.resolve(snapshot);
    });

    expect(result.current.state).toEqual({
      status: "ready",
      snapshot,
      refreshing: false,
    });
    unmount();
    expect(rpc.unsubscribe).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires useInspector to be called inside its provider", () => {
    expect(() => renderHook(useInspector)).toThrow(
      "useInspector must be used within InspectorProvider",
    );
  });
});
