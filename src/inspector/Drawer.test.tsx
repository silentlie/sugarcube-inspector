// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Drawer from "./Drawer";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDrawer() {
  const { container } = render(
    <Drawer initialWidth={380}>
      <span>Inspector content</span>
    </Drawer>,
  );
  const drawer = container.querySelector("aside");
  if (!drawer) throw new Error("Drawer not rendered");
  return drawer;
}

describe("drawer interaction modes", () => {
  it("opens on hover and closes after the existing delay by default", () => {
    const drawer = renderDrawer();
    expect(drawer.style.transform).toBe("translateX(calc(100% - 8px))");
    expect(screen.queryByRole("button", { name: "Open SugarCube Inspector" })).toBeNull();

    fireEvent.mouseEnter(drawer);
    expect(drawer.style.transform).toBe("translateX(0)");

    fireEvent.mouseLeave(drawer);
    act(() => vi.advanceTimersByTime(399));
    expect(drawer.style.transform).toBe("translateX(0)");
    act(() => vi.advanceTimersByTime(1));
    expect(drawer.style.transform).toBe("translateX(calc(100% - 8px))");
  });

  it("uses a visible edge tab to toggle the drawer in click mode", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));

    expect(screen.getByRole("button", { name: "Switch to hover mode" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.mouseLeave(drawer);
    act(() => vi.advanceTimersByTime(1000));
    expect(drawer.style.transform).toBe("translateX(0)");

    fireEvent.click(screen.getByRole("button", { name: "Close SugarCube Inspector" }));
    expect(drawer.style.transform).toBe("translateX(100%)");
    fireEvent.mouseEnter(drawer);
    expect(drawer.style.transform).toBe("translateX(100%)");

    fireEvent.click(screen.getByRole("button", { name: "Open SugarCube Inspector" }));
    expect(drawer.style.transform).toBe("translateX(0)");
  });

  it("removes the edge tab and restores hover closing when switching back", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to hover mode" }));

    expect(screen.queryByRole("button", { name: "Close SugarCube Inspector" })).toBeNull();
    fireEvent.mouseLeave(drawer);
    act(() => vi.advanceTimersByTime(400));
    expect(drawer.style.transform).toBe("translateX(calc(100% - 8px))");
  });

  it("cancels pending hover-close when selecting click mode", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.mouseLeave(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));

    act(() => vi.advanceTimersByTime(1000));
    expect(drawer.style.transform).toBe("translateX(0)");
  });
  it("drags the click-mode tab vertically without toggling the drawer", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const tab = screen.getByRole("button", { name: "Close SugarCube Inspector" });

    // Pointer capture is supported in Chromium but not all DOM test environments.
    Object.defineProperties(tab, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(tab, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(tab, { pointerId: 1, clientY: 180 });
    expect(tab.style.top).toBe("clamp(0px, 144px, calc(100vh - 40px))");
    fireEvent.pointerUp(tab, { pointerId: 1 });
    fireEvent.click(tab);
    expect(drawer.style.transform).toBe("translateX(0)");

    fireEvent.click(tab);
    expect(drawer.style.transform).toBe("translateX(100%)");
    expect(tab.style.top).toContain("144px");

    // Switching modes does not reset the tab's position.
    fireEvent.mouseEnter(drawer);
    expect(drawer.style.transform).toBe("translateX(100%)");
  });

  it("clamps vertical dragging to the viewport", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const tab = screen.getByRole("button", { name: "Close SugarCube Inspector" });
    Object.defineProperties(tab, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(tab, { pointerId: 2, button: 0, clientY: 100 });
    fireEvent.pointerMove(tab, { pointerId: 2, clientY: 10000 });
    expect(tab.style.top).toBe(
      `clamp(0px, ${Math.max(0, window.innerHeight - 40)}px, calc(100vh - 40px))`,
    );
    fireEvent.pointerMove(tab, { pointerId: 2, clientY: -10000 });
    expect(tab.style.top).toBe("clamp(0px, 0px, calc(100vh - 40px))");
    fireEvent.pointerCancel(tab, { pointerId: 2 });
  });

  it("allows keyboard positioning of the edge tab", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const tab = screen.getByRole("button", { name: "Close SugarCube Inspector" });

    fireEvent.keyDown(tab, { key: "ArrowDown" });
    expect(tab.style.top).toContain("88px");
    fireEvent.keyDown(tab, { key: "ArrowUp" });
    expect(tab.style.top).toContain("64px");
    expect(drawer.style.transform).toBe("translateX(0)");
  });

});
