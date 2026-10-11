import { mountPanelDashboard, type DashboardHost } from "./panelDashboard";
import { registerNativeInspector, type NativeInspectorHost } from "./nativeInspector";

/** Local DevTools-only composition: no runtime messages or extension debugger. */
export async function initializeDevtoolsPanel(
  status: HTMLElement,
  refreshButton: HTMLButtonElement,
  host: NativeInspectorHost & Pick<DashboardHost, "detectSugarCube">,
): Promise<void> {
  const refreshSidebars = await registerNativeInspector(host);

  mountPanelDashboard(status, refreshButton, {
    detectSugarCube: host.detectSugarCube,
    refreshSidebars: async () => refreshSidebars(),
  });
}
