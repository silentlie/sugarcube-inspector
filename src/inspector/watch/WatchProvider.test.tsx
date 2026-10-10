// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
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

it("derives root structural watching from visible top-level rows without registering the root", async () => {
  const requested: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requested.push(request);
    return { generation: request.generation, changes: [], mainDurationMs: 1 };
  });
  render(<WatchProvider snapshot={snapshot()}>
    <RegisterWatch />
    <Variables />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested).toHaveLength(1);
  expect(requested[0]!.favorites).toEqual([]);
  expect(requested[0]!.visible).not.toContainEqual({
    target: { scope: "story", path: [] }, expanded: false,
  });
  expect(requested[0]!.visible).toContainEqual({
    target: { scope: "story", path: [{ type: "property", key: "score" }] },
    expanded: false,
  });
});

it("continues monitoring an empty root, without retaining missing unfavorited paths", async () => {
  const score = { scope: "story" as const, path: [{ type: "property" as const, key: "score" }] };
  const requests: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  let calls = 0;
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requests.push({ visible: request.visible, favorites: request.favorites });
    calls++;
    const changes = calls === 1
      ? [{ op: "delete", scope: "story", path: score.path }]
      : calls === 3
        ? [{ op: "set", scope: "story", path: score.path, value: 99 }]
        : [];
    return { generation: request.generation, changes, mainDurationMs: 1 };
  });
  const initial = snapshot();
  initial.variables.story = { score: 7 };
  render(<WatchProvider snapshot={initial}><Variables /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.queryByText("Missing watched variables (read-only)")).toBeNull();
  expect(screen.queryByText("score")).toBeNull();
  expect(requests[0]!.visible).not.toContainEqual({
    target: { scope: "story", path: [] }, expanded: false,
  });

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[1]!.visible).toContainEqual({
    target: { scope: "story", path: [] }, expanded: false,
  });
  expect(requests[1]!.visible).not.toContainEqual({ target: score, expanded: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByTitle("99")).toBeTruthy();
  expect(requests[2]!.favorites).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[3]!.visible).not.toContainEqual({
    target: { scope: "story", path: [] }, expanded: false,
  });
});

it("sets favorite state idempotently, and only favorites survive an unmount", async () => {
  const target = { scope: "story" as const, path: [{ type: "property" as const, key: "score" }] };
  const requested: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requested.push(request);
    return { generation: request.generation, changes: [], mainDurationMs: 1 };
  });
  const { result } = renderHook(() => useWatch(), {
    wrapper: ({ children }) => (
      <WatchProvider snapshot={snapshot()}>{children}</WatchProvider>
    ),
  });

  act(() => {
    result.current.setVisible(target, true);
    result.current.toggleFavorite(target, true);
    result.current.toggleFavorite(target, true);
  });
  expect(result.current.favorites.size).toBe(1);
  act(() => result.current.setVisible(target, false));
  expect(result.current.watchedTargets).toEqual([target]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[0]!.visible).toEqual([]);
  expect(requested[0]!.favorites).toEqual([target]);

  act(() => {
    result.current.toggleFavorite(target, false);
    result.current.toggleFavorite(target, false);
  });
  expect(result.current.favorites.size).toBe(0);
  expect(result.current.watchedTargets).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested).toHaveLength(1); // Neither list has watches now.
});

it("polls empty story roots even when no variable tiles exist", async () => {
  const requests: Array<{ visible: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[] };
    requests.push(request);
    return { generation: request.generation, changes: [], mainDurationMs: 1 };
  });
  const empty = snapshot();
  empty.variables.story = {};
  empty.variables.temporary = {};
  render(<WatchProvider snapshot={empty}><Variables /></WatchProvider>);
  expect(screen.getAllByText("No variables")).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[0]!.visible).toContainEqual({
    target: { scope: "story", path: [] }, expanded: false,
  });
});

it("polls immediately after expanding a visible container", async () => {
  const requests: Array<{ visible: Array<{ target: unknown; expanded: boolean }> }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: Array<{ target: unknown; expanded: boolean }> };
    requests.push(request);
    return { generation: request.generation, changes: [], mainDurationMs: 1 };
  });
  render(<WatchProvider snapshot={snapshot()}><Variables /></WatchProvider>);
  expect(rpc.sendMessage).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  expect(requests).toHaveLength(1);
  expect(requests[0]!.visible).toContainEqual({
    target: { scope: "story", path: [{ type: "property", key: "inventory" }] },
    expanded: true,
  });
});

it("throws if useWatch is called outside WatchProvider", () => {
  expect(() => renderHook(() => useWatch())).toThrow(
    "useWatch must be used within WatchProvider",
  );
});
