// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider, useWatch } from "./WatchProvider";
import { useVariableVersion } from "./useVariableVersion";
import Variables from "../Variables";
import type { VariablePath } from "../../sugarcube/watch/types";

const rpc = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, request: unknown) => Promise<unknown>>(),
}));
vi.mock("../../sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

function RegisterWatch() {
  const watch = useWatch();
  const setVisible = watch.setVisible;
  useEffect(() => {
    const target: VariablePath = [{ type: "property", key: "story" }, { type: "property" as const, key: "score" }];
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

it("continues polling after successful responses", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [],
  }));
  render(<WatchProvider snapshot={snapshot()}><RegisterWatch /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(760); });
  expect(rpc.sendMessage).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("status")).toBeNull();
});

it("requests a fresh snapshot on generation mismatch", async () => {
  const onResync = vi.fn();
  rpc.sendMessage.mockResolvedValue({
    generation: 99, changes: [],
  });
  render(<WatchProvider snapshot={snapshot()} onResync={onResync}>
    <RegisterWatch />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(onResync).toHaveBeenCalledTimes(1);
  expect(rpc.sendMessage).toHaveBeenCalledTimes(1);
});

it("always sends the active root alongside visible top-level rows", async () => {
  const requested: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requested.push(request);
    return { generation: request.generation, changes: [] };
  });
  render(<WatchProvider snapshot={snapshot()}>
    <RegisterWatch />
    <Variables />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested).toHaveLength(1);
  expect(requested[0]!.favorites).toEqual([]);
  expect(requested[0]!.visible).toContainEqual([{ type: "property", key: "story" }]);
  expect(requested[0]!.visible).toContainEqual([{ type: "property", key: "story" }, { type: "property", key: "score" }]);
});

it.each([
  { label: "the root is empty", story: {}, primitiveVisible: false },
  { label: "all immediate values are containers", story: { mc: { hp: 100 }, inventory: [] }, primitiveVisible: false },
  { label: "only opaque objects exist", story: { date: new Date(0) }, primitiveVisible: false },
  { label: "a number exists but is offscreen", story: { mc: {}, score: 0 }, primitiveVisible: false },
  { label: "a number is visibly watched", story: { mc: {}, score: 0 }, primitiveVisible: true },
  { label: "null exists but is offscreen", story: { mc: {}, score: null }, primitiveVisible: false },
  { label: "null is visibly watched", story: { mc: {}, score: null }, primitiveVisible: true },
  { label: "undefined exists but is offscreen", story: { mc: {}, score: undefined }, primitiveVisible: false },
  { label: "undefined is visibly watched", story: { mc: {}, score: undefined }, primitiveVisible: true },
])("always registers the active root when $label", async ({ story, primitiveVisible }) => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [],
  }));
  const initial = snapshot();
  initial.variables.story = story;
  render(<WatchProvider snapshot={initial}>
    <Variables />
    {primitiveVisible && <RegisterWatch />}
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });

  const request = rpc.sendMessage.mock.calls[0]![1] as {
    visible: VariablePath[];
  };
  expect(request.visible).toContainEqual([{ type: "property", key: "story" }]);
  if (primitiveVisible) {
    expect(request.visible).toContainEqual([{ type: "property", key: "story" }, { type: "property", key: "score" }]);
  }
});

it("keeps the root structural watch while visible primitive rows appear and disappear", async () => {
  const initial = snapshot();
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [],
  }));
  const { rerender } = render(<WatchProvider snapshot={initial}>
    <Variables />
    <RegisterWatch />
  </WatchProvider>);
  const containsRoot = (index: number) => {
    const request = rpc.sendMessage.mock.calls[index]![1] as {
      visible: VariablePath[];
    };
    return request.visible.some((target) =>
      target.length === 1 && target[0].key === "story",
    );
  };
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(containsRoot(0)).toBe(true);

  rerender(<WatchProvider snapshot={initial}><Variables /></WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(containsRoot(1)).toBe(true);

  rerender(<WatchProvider snapshot={initial}>
    <Variables />
    <RegisterWatch />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(containsRoot(2)).toBe(true);
});

it("watches only the active scope root while switching variable tabs", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [],
  }));
  render(<WatchProvider snapshot={snapshot()}><Variables /></WatchProvider>);
  const activeRoots = (index: number) => {
    const request = rpc.sendMessage.mock.calls[index]![1] as {
      visible: VariablePath[];
    };
    return request.visible.filter((target) => target.length === 1)
      .map((target) => target[0].key);
  };
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(activeRoots(0)).toEqual(["story"]);

  fireEvent.click(screen.getByRole("tab", { name: "Temporary Variables" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(activeRoots(1)).toEqual(["temporary"]);

  fireEvent.click(screen.getByRole("tab", { name: "Story Variables" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(activeRoots(2)).toEqual(["story"]);
});

it("keeps the root structural watch with only a nested primitive watch", async () => {
  const initial = snapshot();
  initial.variables.story = { player: { hp: 100 } };
  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [],
  }));
  function RegisterNested() {
    const watch = useWatch();
    const setVisible = watch.setVisible;
    useEffect(() => {
      const target: VariablePath = [{ type: "property", key: "story" }, 
        { type: "property" as const, key: "player" },
        { type: "property" as const, key: "hp" },
      ];
      setVisible(target, true);
      return () => setVisible(target, false);
    }, [setVisible]);
    return null;
  }
  render(<WatchProvider snapshot={initial}>
    <Variables />
    <RegisterNested />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  const request = rpc.sendMessage.mock.calls[0]![1] as {
    visible: VariablePath[];
  };
  expect(request.visible).toContainEqual([{ type: "property", key: "story" }]);
});

it("continues monitoring an empty root, without retaining missing unfavorited paths", async () => {
  const score: VariablePath = [{ type: "property", key: "story" }, { type: "property" as const, key: "score" }];
  const requests: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  let calls = 0;
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requests.push({ visible: request.visible, favorites: request.favorites });
    calls++;
    const changes = calls === 1
      ? [{ op: "delete", path: score }]
      : calls === 3
        ? [{ op: "set", path: score, value: 99 }]
        : [];
    return { generation: request.generation, changes };
  });
  const initial = snapshot();
  initial.variables.story = { score: 7 };
  // happy-dom doesn't report element intersections; explicitly register the
  // top-level row while it exists, then unregister it when the row unmounts.
  function VisibleScore() {
    const watch = useWatch();
    useVariableVersion(watch.store, [{ type: "property", key: "story" }]);
    return Object.hasOwn(watch.variables.story, "score") ? <RegisterWatch /> : null;
  }
  render(<WatchProvider snapshot={initial}>
    <VisibleScore />
    <Variables />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.queryByText("Missing watched variables (read-only)")).toBeNull();
  expect(screen.queryByText("score")).toBeNull();
  expect(requests[0]!.visible).toContainEqual([{ type: "property", key: "story" }]);

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[1]!.visible).toContainEqual([{ type: "property", key: "story" }]);
  expect(requests[1]!.visible).not.toContainEqual(score);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByTitle("99")).toBeTruthy();
  expect(requests[2]!.favorites).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[3]!.visible).toContainEqual([{ type: "property", key: "story" }]);
});

it("sets favorite state idempotently, and only favorites survive an unmount", async () => {
  const target: VariablePath = [{ type: "property", key: "story" }, { type: "property" as const, key: "score" }];
  const requested: Array<{ visible: unknown[]; favorites: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[]; favorites: unknown[] };
    requested.push(request);
    return { generation: request.generation, changes: [] };
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
  expect(result.current.watchedPaths).toEqual([target]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[0]!.visible).toEqual([]);
  expect(requested[0]!.favorites).toEqual([target]);

  act(() => {
    result.current.toggleFavorite(target, false);
    result.current.toggleFavorite(target, false);
  });
  expect(result.current.favorites.size).toBe(0);
  expect(result.current.watchedPaths).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested).toHaveLength(1); // Neither list has watches now.
});

it("lets users unfavorite a missing variable without waiting for it to return", async () => {
  const path = [
    { type: "property" as const, key: "story" as const },
    { type: "property" as const, key: "score" },
  ];
  const requests: Array<{ favorites: unknown[] }> = [];
  let polls = 0;
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; favorites: unknown[] };
    requests.push({ favorites: request.favorites });
    return {
      generation: request.generation,
      changes: polls++ === 0
        ? [{ op: "delete", path }]
        : [],
    };
  });

  render(<WatchProvider snapshot={snapshot()}><Variables /></WatchProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Favorite score" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });

  expect(requests[0]!.favorites).toContainEqual(path);
  fireEvent.click(screen.getByRole("button", { name: "Unfavorite $score" }));
  expect(screen.queryByText("Missing watched variables (read-only)")).toBeNull();

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[1]!.favorites).toEqual([]);
});

it("polls empty story roots even when no variable tiles exist", async () => {
  const requests: Array<{ visible: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[] };
    requests.push(request);
    return { generation: request.generation, changes: [] };
  });
  const empty = snapshot();
  empty.variables.story = {};
  empty.variables.temporary = {};
  render(<WatchProvider snapshot={empty}><Variables /></WatchProvider>);
  expect(screen.getAllByText("No variables")).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requests[0]!.visible).toContainEqual([{ type: "property", key: "story" }]);
});

it("omits collapsed containers from visible watches unless favorited", async () => {
  const requested: Array<{
    favorites: unknown[];
    visible: unknown[];
  }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as {
      generation: number;
      favorites: unknown[];
      visible: unknown[];
    };
    requested.push({ favorites: request.favorites, visible: request.visible });
    return { generation: request.generation, changes: [] };
  });

  // happy-dom does not drive IntersectionObserver; keep the visible scalar
  // explicitly registered to exercise regular polls before expansion.
  render(<WatchProvider snapshot={snapshot()}>
    <RegisterWatch />
    <Variables />
  </WatchProvider>);
  const inventory = [{ type: "property", key: "story" }, { type: "property", key: "inventory" }];

  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[0]!.visible).not.toContainEqual(inventory);
  expect(requested[0]!.favorites).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(requested[1]!.visible).toContainEqual(inventory);

  fireEvent.click(screen.getByRole("button", { name: "Collapse inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[2]!.visible).not.toContainEqual(inventory);

  fireEvent.click(screen.getByRole("button", { name: "Favorite inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[3]!.visible).not.toContainEqual(inventory);
  expect(requested[3]!.favorites).toContainEqual(inventory);

  fireEvent.click(screen.getByRole("button", { name: "Unfavorite inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(requested[4]!.favorites).not.toContainEqual(inventory);
  expect(requested[4]!.visible).not.toContainEqual(inventory);
});

it("polls immediately after expanding a visible container", async () => {
  const requests: Array<{ visible: unknown[] }> = [];
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { generation: number; visible: unknown[] };
    requests.push(request);
    return { generation: request.generation, changes: [] };
  });
  render(<WatchProvider snapshot={snapshot()}><Variables /></WatchProvider>);
  expect(rpc.sendMessage).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  expect(requests).toHaveLength(1);
  expect(requests[0]!.visible).toContainEqual([{ type: "property", key: "story" }, { type: "property", key: "inventory" }]);
});

it("throws if useWatch is called outside WatchProvider", () => {
  expect(() => renderHook(() => useWatch())).toThrow(
    "useWatch must be used within WatchProvider",
  );
});

it("rerenders a subscribed leaf without updating unrelated leaf versions or replacing the root", async () => {
  const initial = snapshot();
  const seen: Record<string, number[]> = { score: [], choice: [] };
  const root = initial.variables.story;

  function Probe({ keyName }: { keyName: "score" | "choice" }) {
    const watch = useWatch();
    const target: VariablePath = [
        { type: "property", key: keyName === "score" ? "story" : "temporary" },
        { type: "property", key: keyName },
      ];
    const version = useVariableVersion(watch.store, target);
    seen[keyName]!.push(version);
    return <div data-testid={keyName}>{String(watch.store.getValue(target))}</div>;
  }

  rpc.sendMessage.mockImplementation(async (_type, data) => ({
    generation: (data as { generation: number }).generation,
    changes: [{ op: "set", path: [{ type: "property", key: "story" }, { type: "property", key: "score" }], value: 15 }],
  }));
  render(<WatchProvider snapshot={initial}>
    <RegisterWatch />
    <Probe keyName="score" />
    <Probe keyName="choice" />
  </WatchProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  expect(screen.getByTestId("score").textContent).toBe("15");
  expect(screen.getByTestId("choice").textContent).toBe("north");
  expect(initial.variables.story).toBe(root);
  expect(seen.score).toEqual([0, 1]);
  expect(seen.choice).toEqual([0]);
});
