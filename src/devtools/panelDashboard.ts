export interface DashboardHost {
  detectSugarCube(): Promise<boolean>;
  refreshSidebars(): Promise<void>;
}

/** Dashboard only exchanges primitive status, never SugarCube variable objects. */
export function mountPanelDashboard(
  status: HTMLElement,
  refreshButton: HTMLButtonElement,
  host: DashboardHost,
): void {
  let busy = false;

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    refreshButton.disabled = true;
    status.textContent = "Checking inspected page…";
    try {
      const detected = await host.detectSugarCube();
      await host.refreshSidebars();
      status.textContent = detected
        ? "SugarCube detected. Inspect live variables in Elements > SugarCube Story / SugarCube Temporary."
        : "SugarCube not detected in the inspected page. Navigate to a SugarCube story and refresh.";
    } catch (error) {
      status.textContent = `Could not refresh: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", () => { void refresh(); });
  void refresh();
}
