// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider, useOptionalWatch } from "./WatchProvider";

const rpc = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, request: unknown) => Promise<unknown>>(),
}));
vi.mock("../../sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

function RegisterWatch() {
  const watch = useOptionalWatch();
  const setVisible = watch?.setVisible;
  useEffect(() => {
    if (!setVisible) return;
    const target = { scope: "story" as const, path: [{ type: "property" as const, key: "score" }] };
    setVisible(target, true);
    return () => setVisible(target, false);
  }, [setVisible]);
  return null;
}

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

it("shows a dismissible warning when a targeted watch request exceeds 250ms", async () => {
  rpc.sendMessage.mockImplementation((_type, data) =>
    new Promise((resolve) => {
      window.setTimeout(() => {
        const request = data as { session: string; revision: number };
        resolve({
          session: request.session,
          baseRevision: request.revision,
          revision: request.revision,
          patches: [],
        });
      }, 310);
    }),
  );

  render(
    <WatchProvider snapshot={createSnapshotFixture()}>
      <RegisterWatch />
    </WatchProvider>,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_100);
  });

  expect(rpc.sendMessage).toHaveBeenCalledWith("getWatchChanges", expect.objectContaining({
    targets: [{ scope: "story", path: [{ type: "property", key: "score" }] }],
  }));
  expect(screen.getByRole("status").textContent).toContain("Watch request took");
  expect(screen.getByRole("status").textContent).toContain("250 ms");
});

it("does not warn about a quick watch request", async () => {
  rpc.sendMessage.mockImplementation(async (_type, data) => {
    const request = data as { session: string; revision: number };
    return {
      session: request.session,
      baseRevision: request.revision,
      revision: request.revision,
      patches: [],
    };
  });

  render(
    <WatchProvider snapshot={createSnapshotFixture()}>
      <RegisterWatch />
    </WatchProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(screen.queryByRole("status")).toBeNull();
});
