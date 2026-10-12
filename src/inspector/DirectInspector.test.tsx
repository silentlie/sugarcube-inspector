// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectInspector from "./DirectInspector";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SugarCube startup gating", () => {
  it("shows loading until State becomes available, then renders the inspector", async () => {
    vi.useFakeTimers();
    const view = render(<DirectInspector />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for SugarCube");
    expect(screen.queryByText("SugarCube Inspector")).toBeNull();

    vi.stubGlobal("SugarCube", {
      State: { variables: { day: 1 }, temporary: {} },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("SugarCube Inspector")).toBeTruthy();
    view.unmount();
  });
});
