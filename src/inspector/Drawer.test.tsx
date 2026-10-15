// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Drawer from "./Drawer";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderDrawer(initialWidth = 380) {
  const { container } = render(
    <Drawer initialWidth={initialWidth}>
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

  it("keeps closed content inert while preserving the appropriate reveal control", () => {
    const drawer = renderDrawer();
    const content = drawer.querySelector("div");
    const modeButton = drawer.querySelector<HTMLButtonElement>(
      '[aria-label="Switch to click-to-toggle mode"]',
    );
    const resizeHandle = drawer.querySelector<HTMLButtonElement>(
      '[aria-label="Resize SugarCube Inspector"]',
    );
    expect(content?.hasAttribute("inert")).toBe(true);
    expect(modeButton?.hasAttribute("inert")).toBe(true);
    // Hover mode still needs its keyboard-operable resize/reveal handle.
    expect(resizeHandle?.hasAttribute("inert")).toBe(false);

    fireEvent.mouseEnter(drawer);
    expect(content?.hasAttribute("inert")).toBe(false);
    expect(modeButton?.hasAttribute("inert")).toBe(false);

    fireEvent.click(modeButton!);
    fireEvent.click(screen.getByRole("button", { name: "Close SugarCube Inspector" }));
    expect(content?.hasAttribute("inert")).toBe(true);
    expect(modeButton?.hasAttribute("inert")).toBe(true);
    expect(resizeHandle?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("button", { name: "Open SugarCube Inspector" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open SugarCube Inspector" }));
    expect(content?.hasAttribute("inert")).toBe(false);
    expect(modeButton?.hasAttribute("inert")).toBe(false);
    expect(resizeHandle?.hasAttribute("inert")).toBe(false);
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

  it("keeps the toggle accessible when the drawer starts wider than the viewport", () => {
    const drawer = renderDrawer(2000);
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const tab = screen.getByRole("button", { name: "Close SugarCube Inspector" });

    // Happy DOM does not retain CSS max(); browser geometry is tested in Playwright.
    expect(drawer.style.transform).toBe("translateX(0)");
    fireEvent.click(tab);
    expect(tab.style.left).toBe("-32px");
    expect(drawer.style.transform).toBe("translateX(100%)");
    fireEvent.click(tab);
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
    fireEvent.pointerUp(tab, { pointerId: 1 });
    fireEvent.click(tab);
    expect(drawer.style.transform).toBe("translateX(0)");

    fireEvent.click(tab);
    expect(drawer.style.transform).toBe("translateX(100%)");

    // Moving the pointer over the drawer does not reopen click mode.
    fireEvent.mouseEnter(drawer);
    expect(drawer.style.transform).toBe("translateX(100%)");
  });

  it("allows resizing beyond 1600px but reserves the 32px tab width", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(2000);
    const drawer = renderDrawer(1900);
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const handle = screen.getByRole("button", { name: "Resize SugarCube Inspector" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("1924px");

    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    fireEvent.pointerDown(handle, { pointerId: 3, button: 0, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: -3000 });
    expect(drawer.style.width).toBe("1968px");
    fireEvent.pointerUp(handle, { pointerId: 3 });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("1968px");
  });

  it("uses the full viewport in hover mode and reserves tab space only in click mode", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    const drawer = renderDrawer(760);
    const handle = screen.getByRole("button", { name: "Resize SugarCube Inspector" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("800px");
    expect(drawer.style.maxWidth).toBe("100vw");

    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("768px");

    fireEvent.click(screen.getByRole("button", { name: "Switch to hover mode" }));
    expect(drawer.style.maxWidth).toBe("100vw");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("800px");
  });

  it("lets CSS enforce the intrinsic minimum during pointer resizing", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const drawer = renderDrawer(380);
    expect(drawer.style.minWidth).toBe("min-content");

    const handle = screen.getByRole("button", { name: "Resize SugarCube Inspector" });
    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(handle, { pointerId: 4, button: 0, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 4, clientX: 1400 });
    // The requested width can reach zero; CSS min-content controls rendered width.
    expect(drawer.style.width).toBe("0px");
    fireEvent.pointerMove(handle, { pointerId: 4, clientX: 570 });
    expect(drawer.style.width).toBe("210px");
    fireEvent.pointerUp(handle, { pointerId: 4 });
  });

  it("resizes using rendered width without measuring min-content in JavaScript", () => {
    const drawer = renderDrawer(300);
    vi.spyOn(drawer, "getBoundingClientRect").mockReturnValue({ width: 400 } as DOMRect);
    const handle = screen.getByRole("button", { name: "Resize SugarCube Inspector" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawer.style.width).toBe("424px");
    expect(drawer.style.minWidth).toBe("min-content");
  });

  it("handles keyboard movement without toggling the drawer", () => {
    const drawer = renderDrawer();
    fireEvent.mouseEnter(drawer);
    fireEvent.click(screen.getByRole("button", { name: "Switch to click-to-toggle mode" }));
    const tab = screen.getByRole("button", { name: "Close SugarCube Inspector" });

    fireEvent.keyDown(tab, { key: "ArrowDown" });
    fireEvent.keyDown(tab, { key: "ArrowUp" });
    expect(drawer.style.transform).toBe("translateX(0)");
  });
});
