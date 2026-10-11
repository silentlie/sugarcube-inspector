export interface DashboardHost {
  detectSugarCube(): Promise<boolean>;
  refreshSidebars(): Promise<void>;
}

const REFRESH_TIMEOUT_MS = 10_000;

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for Chrome DevTools. Try refreshing again."));
        }, REFRESH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
      const detected = await withTimeout((async () => {
        const found = await host.detectSugarCube();
        await host.refreshSidebars();
        return found;
      })());
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
