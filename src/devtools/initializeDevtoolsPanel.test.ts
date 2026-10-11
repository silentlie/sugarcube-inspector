// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDevtoolsPanel } from "./initializeDevtoolsPanel";
import type { InspectEntry, InspectResult } from "./lazyInspection";

afterEach(() => { cleanup(); document.body.innerHTML = ""; });

function setup() {
  document.body.innerHTML = '<p id="status"></p><button id="refresh">Refresh</button><div id="variables"></div>';
  const status = document.querySelector<HTMLElement>("#status")!;
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Refresh" });
  const variables = document.querySelector<HTMLElement>("#variables")!;
  const setExpressions = [vi.fn(async () => {}), vi.fn(async () => {})];
  let created = 0;
  let day = 1;
  const inspect = vi.fn(async (path: { root: "story" | "temporary" }): Promise<InspectResult> => {
    const entries: InspectEntry[] = path.root === "story" ? [
      { name: "day", segment: { kind: "property", key: "day" }, preview: String(day), expandable: false },
    ] : [];
    return { entries, total: entries.length, offset: 0 };
  });
  const host = {
    detectSugarCube: vi.fn(async () => true),
    inspect,
    createSidebarPane: vi.fn(async () => ({
      setExpression: setExpressions[created++]!,
      onShown: { addListener: vi.fn() },
    })),
    onNavigated: vi.fn(),
  };
  return { status, button, variables, host, setExpressions, setDay: (value: number) => { day = value; } };
}

describe("same-context native and custom inspector refresh", () => {
  it("shows live variables inside SugarCube and refreshes both viewers", async () => {
    const test = setup();
    await initializeDevtoolsPanel(test.status, test.button, test.variables, test.host);
    expect(await screen.findByText("day")).toBeDefined();
    expect(await screen.findByText("1")).toBeDefined();
    expect(test.setExpressions[0]).toHaveBeenCalledTimes(2);
    expect(test.setExpressions[1]).toHaveBeenCalledTimes(2);

    test.setDay(2);
    await act(async () => { fireEvent.click(test.button); });
    expect(await screen.findByText("2")).toBeDefined();
    await waitFor(() => expect(test.status.textContent).toContain("SugarCube detected"));
    expect(test.setExpressions[0]).toHaveBeenCalledTimes(3);
    expect(test.setExpressions[1]).toHaveBeenCalledTimes(3);
  });

  it("does not block a refresh on unresolved hidden native panes", async () => {
    const test = setup();
    test.host.createSidebarPane.mockImplementation(async () => ({
      setExpression: () => new Promise<void>(() => {}),
      onShown: { addListener: vi.fn() },
    }));
    await initializeDevtoolsPanel(test.status, test.button, test.variables, test.host);
    await waitFor(() => expect(test.status.textContent).toContain("SugarCube detected"));
    expect(test.button.disabled).toBe(false);
    expect(await screen.findByText("day")).toBeDefined();
  });
});
