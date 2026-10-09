// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSnapshotFixture } from "../../tests/fixtures";
import type { SugarCubeSnapshot } from "../sugarcube/types";
import InspectorContent from "./InspectorContent";
import { InspectorProvider } from "./InspectorContext";

const rpc = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, data: unknown) => Promise<unknown>>(),
  onMessage: vi.fn(() => () => {}),
}));

vi.mock("../sugarcube/rpc", () => ({ sugarcubeRPC: rpc }));

function renderInspector() {
  return render(
    <InspectorProvider>
      <InspectorContent />
    </InspectorProvider>,
  );
}

async function resolveSnapshot(
  request: PromiseWithResolvers<unknown>,
  snapshot = createSnapshotFixture(),
) {
  await act(async () => {
    request.resolve(snapshot);
  });
}

describe("inspector content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpc.sendMessage.mockReset();
    rpc.onMessage.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows loading controls, then the story title and variables after loading", async () => {
    const request = Promise.withResolvers<unknown>();
    rpc.sendMessage.mockReturnValueOnce(request.promise);
    renderInspector();

    expect(
      screen.getByRole("heading", { name: "Loading story..." }),
    ).toBeDefined();
    expect(screen.getByText("Loading SugarCube data...")).toBeDefined();
    const refresh = screen.getByRole<HTMLButtonElement>("button", {
      name: "Refresh snapshot",
    });
    const pin = screen.getByRole<HTMLButtonElement>("button", {
      name: "Pin inspector (coming soon)",
    });
    expect(refresh.disabled).toBe(true);
    expect(pin.disabled).toBe(true);
    fireEvent.click(refresh);
    fireEvent.click(pin);
    expect(rpc.sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tablist")).toBeNull();

    const snapshot = createSnapshotFixture();
    snapshot.story.name = "A story with a long descriptive title";
    await resolveSnapshot(request, snapshot);

    const title = screen.getByRole("heading", { name: snapshot.story.name });
    expect(title.getAttribute("title")).toBe(snapshot.story.name);
    expect(refresh.disabled).toBe(false);
    expect(pin.disabled).toBe(true);
    expect(
      screen.getByRole("tabpanel", { name: "Story Variables" }),
    ).toBeDefined();
    expect(screen.queryByText("Loading SugarCube data...")).toBeNull();
  });

  it("disables duplicate refreshes while keeping the previous variables visible", async () => {
    const initial = Promise.withResolvers<unknown>();
    const next = Promise.withResolvers<unknown>();
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(next.promise);
    renderInspector();
    await resolveSnapshot(initial);
    const refresh = screen.getByRole<HTMLButtonElement>("button", {
      name: "Refresh snapshot",
    });

    fireEvent.click(refresh);
    expect(refresh.disabled).toBe(true);
    expect(screen.getByTitle("7")).toBeDefined();
    fireEvent.click(refresh);
    expect(rpc.sendMessage).toHaveBeenCalledTimes(2);

    const updated = createSnapshotFixture();
    Object.assign(updated.variables.story, { score: 12 });
    await resolveSnapshot(next, updated);

    expect(refresh.disabled).toBe(false);
    expect(screen.getByTitle("12")).toBeDefined();
    expect(screen.queryByTitle("7")).toBeNull();
  });

  it("shows an initial failure and restores the inspector after Retry", async () => {
    const initial = Promise.withResolvers<unknown>();
    const retry = Promise.withResolvers<unknown>();
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise);
    renderInspector();
    await act(async () => {
      initial.reject(new Error("Bridge unavailable"));
    });

    expect(
      screen.getByRole("heading", { name: "Inspector Error" }),
    ).toBeDefined();
    expect(screen.getByText("Bridge unavailable")).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh snapshot",
      }).disabled,
    ).toBe(true);
    expect(screen.queryByRole("tablist")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Loading SugarCube data...")).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "Inspector Error" }),
    ).toBeNull();
    expect(rpc.sendMessage).toHaveBeenCalledTimes(2);
    await resolveSnapshot(retry);

    expect(screen.getByRole("heading", { name: "Test Story" })).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh snapshot",
      }).disabled,
    ).toBe(false);
    expect(
      screen.getByRole("tabpanel", { name: "Story Variables" }),
    ).toBeDefined();
  });

  it("rejects a malformed snapshot without displaying its variables", async () => {
    const request = Promise.withResolvers<unknown>();
    rpc.sendMessage.mockReturnValueOnce(request.promise);
    renderInspector();
    await act(async () => {
      request.resolve({ variables: { story: { unsafe: "unvalidated" } } });
    });

    expect(
      screen.getByRole("heading", { name: "Inspector Error" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTitle('"unvalidated"')).toBeNull();
  });

  it("keeps the last story title after a refresh failure and restores its data on Retry", async () => {
    const initial = Promise.withResolvers<unknown>();
    const refresh = Promise.withResolvers<unknown>();
    const retry = Promise.withResolvers<unknown>();
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise)
      .mockReturnValueOnce(retry.promise);
    renderInspector();
    await resolveSnapshot(initial);
    fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" }));
    await act(async () => {
      refresh.reject(new Error("Snapshot unavailable"));
    });

    expect(
      screen.getByRole("heading", { name: "Test Story" }).getAttribute("title"),
    ).toBe("Test Story");
    expect(screen.getByText("Snapshot unavailable")).toBeDefined();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh snapshot",
      }).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByTitle("7")).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh snapshot",
      }).disabled,
    ).toBe(true);
    const recovered: SugarCubeSnapshot = createSnapshotFixture();
    Object.assign(recovered.variables.story, { score: 15 });
    await resolveSnapshot(retry, recovered);

    expect(
      screen.queryByRole("heading", { name: "Inspector Error" }),
    ).toBeNull();
    expect(screen.getByTitle("15")).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Refresh snapshot",
      }).disabled,
    ).toBe(false);
  });

  it("shows a timeout with Retry and ignores the late initial result", async () => {
    const initial = Promise.withResolvers<unknown>();
    const retry = Promise.withResolvers<unknown>();
    rpc.sendMessage
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise);
    renderInspector();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(
      screen.getByRole("heading", { name: "Inspector Error" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    await resolveSnapshot(initial);
    expect(
      screen.getByRole("heading", { name: "Inspector Error" }),
    ).toBeDefined();
    expect(screen.queryByRole("tablist")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await resolveSnapshot(retry);
    expect(screen.getByRole("heading", { name: "Test Story" })).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "Inspector Error" }),
    ).toBeNull();
  });
});
