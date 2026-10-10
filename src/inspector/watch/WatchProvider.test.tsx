// @vitest-environment happy-dom

import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider, useWatch } from "./WatchProvider";
import Variables from "../Variables";

const rpc = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, request: unknown) => Promise<unknown>>(),
}));
vi.mock("../../sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

function RegisterWatch() {
  const watch = useWatch();
  const setVisible = watch.setVisible;
  useEffect(() => {
    const target = { scope: "story" as const, path: [{ type: "property" as const, key: "score" }] };
    setVisible(target, true);
    return () => setVisible(target, false);
  }, [setVisible]);
  return null;
}

const snapshot = () => ({ ...createSnapshotFixture(), watchGeneration: 1 });

beforeEach(() => {
  vi.useFakeTimers();
  rpc.sendMessage.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("continues polling after slow MAIN-world work without showing a notice", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [], mainDurationMs: 58,
  }));
  render(<WatchProvider snapshot={snapshot()}><RegisterWatch /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(760); });
  expect(rpc.sendMessage).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("status")).toBeNull();
});

it("requests a fresh snapshot on generation mismatch", async () => {
  const onResync = vi.fn();
  rpc.sendMessage.mockResolvedValue({
    generation: 99, changes: [], mainDurationMs: 1,
  });
  render(<WatchProvider snapshot={snapshot()} onResync={onResync}>
    <RegisterWatch />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(onResync).toHaveBeenCalledTimes(1);
  expect(rpc.sendMessage).toHaveBeenCalledTimes(1);
});

it("retains deleted watches in one registry, without missingTargets in the RPC", async () => {
  const score = { scope: "story" as const, path: [{ type: "property" as const, key: "score" }] };
  const requested: unknown[][] = [];
  let calls = 0;
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; targets: unknown[] };
    requested.push(request.targets);
    calls++;
    const changes = calls === 1
      ? [{ op: "delete", scope: "story", path: score.path }]
      : calls === 3
        ? [{ op: "set", scope: "story", path: score.path, value: 99 }]
        : [];
    return { generation: request.generation, changes, mainDurationMs: 1 };
  });

  function ConditionalWatch() {
    const watch = useWatch();
    const exists = Object.hasOwn(watch.variables.story, "score");
    return exists ? <RegisterWatch /> : null;
  }

  render(<WatchProvider snapshot={snapshot()}>
    <ConditionalWatch />
    <Variables />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByText("Missing watched variables (read-only)")).toBeTruthy();
  expect(screen.getByText("$score")).toBeTruthy();

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[1]).toContainEqual(score); // Still watched after its row unmounts.

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.queryByText("$score")).toBeNull();
  expect(screen.getByTitle("99")).toBeTruthy();
  expect(requested[2]).toContainEqual(score);
});

it("throws if useWatch is called outside WatchProvider", () => {
  expect(() => renderHook(() => useWatch())).toThrow(
    "useWatch must be used within WatchProvider",
  );
});
