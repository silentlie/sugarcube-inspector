import { mountPanelDashboard, type DashboardHost } from "./panelDashboard";
import { registerNativeInspector, type NativeInspectorHost } from "./nativeInspector";
import { mountVariableTree, type InspectChildren } from "./LiveVariableTree";

/** DevTools-only, read-only inspection: never ships game objects across worlds. */
export async function initializeDevtoolsPanel(
  status: HTMLElement,
  refreshButton: HTMLButtonElement,
  variableContainer: HTMLElement,
  host: NativeInspectorHost & Pick<DashboardHost, "detectSugarCube"> & {
    inspect: InspectChildren;
  },
): Promise<void> {
  const refreshNative = await registerNativeInspector(host);
  const tree = mountVariableTree(variableContainer, host.inspect);
  host.onNavigated(tree.refresh);

  mountPanelDashboard(status, refreshButton, {
    detectSugarCube: host.detectSugarCube,
    refreshSidebars: async () => {
      refreshNative();
      tree.refresh();
    },
  });
}
