// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { mountPanelDashboard } from "./panelDashboard";

afterEach(() => { document.body.innerHTML = ""; });

describe("DevTools dashboard", () => {
  it("detects SugarCube and refreshes the native sidebar panes on demand", async () => {
    document.body.innerHTML = '<div id="status"></div><button id="refresh">Refresh</button>';
    const status = document.querySelector<HTMLElement>("#status")!;
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Refresh" });
    const host = {
      detectSugarCube: vi.fn(async () => true),
      refreshSidebars: vi.fn(async () => {}),
    };
    mountPanelDashboard(status, button, host);
    await waitFor(() => expect(status.textContent).toContain("SugarCube detected"));
    expect(host.refreshSidebars).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await waitFor(() => expect(host.refreshSidebars).toHaveBeenCalledTimes(2));
  });
});
