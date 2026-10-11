// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { initializeDevtoolsPanel } from "./initializeDevtoolsPanel";

afterEach(() => { document.body.innerHTML = ""; });

describe("same-context native inspector refresh", () => {
  it("refreshes native sidebars from the dashboard without runtime messaging", async () => {
    document.body.innerHTML = '<p id="status"></p><button id="refresh">Refresh</button>';
    const status = document.querySelector<HTMLElement>("#status")!;
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Refresh" });
    const setExpressions = [
      vi.fn(async () => {}),
      vi.fn(async () => {}),
    ];
    let created = 0;
    const host = {
      detectSugarCube: vi.fn(async () => true),
      createSidebarPane: vi.fn(async () => ({
        setExpression: setExpressions[created++]!,
        onShown: { addListener: vi.fn() },
      })),
      onNavigated: vi.fn(),
    };

    await initializeDevtoolsPanel(status, button, host);
    await waitFor(() => expect(status.textContent).toContain("SugarCube detected"));
    expect(setExpressions[0]).toHaveBeenCalledTimes(2);
    expect(setExpressions[1]).toHaveBeenCalledTimes(2);

    fireEvent.click(button);
    await waitFor(() => expect(setExpressions[0]).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(status.textContent).toContain("SugarCube detected"));
    expect(setExpressions[1]).toHaveBeenCalledTimes(3);
  });

  it("completes refresh even if native Elements panes never resolve evaluation", async () => {
    document.body.innerHTML = '<p id="status"></p><button id="refresh">Refresh</button>';
    const status = document.querySelector<HTMLElement>("#status")!;
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Refresh" });
    await initializeDevtoolsPanel(status, button, {
      detectSugarCube: async () => true,
      createSidebarPane: vi.fn(async () => ({
        setExpression: () => new Promise<void>(() => {}),
        onShown: { addListener: vi.fn() },
      })),
      onNavigated: vi.fn(),
    });
    await waitFor(() => expect(status.textContent).toContain("SugarCube detected"));
    expect(button.disabled).toBe(false);
  });
});
