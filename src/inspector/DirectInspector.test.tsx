// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectInspector from "./DirectInspector";

vi.mock("../variables/ui/VariableTree", () => ({
  default: ({ storeKey, active }: { storeKey: string; active: boolean }) =>
    <div data-testid={`tree-${storeKey}`} data-active={String(active)} />,
  FavoritesTree: ({ active }: { active: boolean }) =>
    <div data-testid="tree-favorites" data-active={String(active)} />,
}));

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

  it("activates only the selected scope while the Variables tab is active", () => {
    vi.stubGlobal("SugarCube", {
      State: { variables: { day: 1 }, temporary: { choice: "north" } },
    });
    const view = render(<DirectInspector />);

    fireEvent.click(screen.getByRole("tab", { name: "Variables" }));
    expect(screen.getByTestId("tree-variables").dataset.active).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Temporary Variables" }));
    expect(screen.getByTestId("tree-variables").dataset.active).toBe("false");
    expect(screen.getByTestId("tree-temporary").dataset.active).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByTestId("tree-variables").dataset.active).toBe("false");
    expect(screen.getByTestId("tree-temporary").dataset.active).toBe("false");

    fireEvent.click(screen.getByRole("tab", { name: "Variables" }));
    expect(screen.getByTestId("tree-temporary").dataset.active).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Favorites" }));
    expect(screen.getByTestId("tree-variables").dataset.active).toBe("false");
    expect(screen.getByTestId("tree-temporary").dataset.active).toBe("false");
    expect(screen.getByTestId("tree-favorites").dataset.active).toBe("true");

    view.unmount();
  });
});
