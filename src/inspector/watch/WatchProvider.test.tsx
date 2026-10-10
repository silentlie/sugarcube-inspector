// @vitest-environment happy-dom

import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider, useWatch } from "./WatchProvider";

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

it("warns immediately on one MAIN-world poll over 50ms", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [], missingTargets: [], mainDurationMs: 58,
  }));
  render(<WatchProvider snapshot={snapshot()}><RegisterWatch /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByRole("status").textContent).toContain("58 ms");
  expect(screen.getByRole("status").textContent).toContain("stuttering");
  await act(async () => { screen.getByRole("button", { name: "Dismiss watch warning" }).click(); });
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(screen.queryByRole("status")).toBeNull();
});

it("recommends reducing watches after sustained p95 over 10ms", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [], missingTargets: [], mainDurationMs: 12,
  }));
  render(<WatchProvider snapshot={snapshot()}><RegisterWatch /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_050); });
  expect(screen.getByRole("status").textContent).toContain("12 ms");
  expect(screen.getByRole("status").textContent).toContain("responsiveness");
});

it("ignores long RPC round trips when MAIN processing is fast", async () => {
  rpc.sendMessage.mockImplementation((_type, data) =>
    new Promise((resolve) => window.setTimeout(() => resolve({
      generation: (data as { generation: number }).generation,
      changes: [], missingTargets: [], mainDurationMs: 1,
    }), 310)),
  );
  render(<WatchProvider snapshot={snapshot()}><RegisterWatch /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
  expect(screen.queryByRole("status")).toBeNull();
});

it("requests a fresh snapshot on generation mismatch", async () => {
  const onResync = vi.fn();
  rpc.sendMessage.mockResolvedValue({
    generation: 99, changes: [], missingTargets: [], mainDurationMs: 1,
  });
  render(<WatchProvider snapshot={snapshot()} onResync={onResync}>
    <RegisterWatch />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(onResync).toHaveBeenCalledTimes(1);
  expect(rpc.sendMessage).toHaveBeenCalledTimes(1);
});

it("retains missing watched paths after their UI rows unmount", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [], mainDurationMs: 1,
    missingTargets: (data as { targets: unknown[] }).targets,
  }));
  function DisplayMissing() {
    const watch = useWatch();
    return <p>{watch.missingTargets.length} missing</p>;
  }
  const view = render(<WatchProvider snapshot={snapshot()}>
    <RegisterWatch />
    <DisplayMissing />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByText("1 missing")).toBeTruthy();
  view.rerender(<WatchProvider snapshot={snapshot()}><DisplayMissing /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByText("1 missing")).toBeTruthy();
});

it("throws if useWatch is called outside WatchProvider", () => {
  expect(() => renderHook(() => useWatch())).toThrow(
    "useWatch must be used within WatchProvider",
  );
});
