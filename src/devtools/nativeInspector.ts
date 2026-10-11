/**
 * Native DevTools sidebar panes inspect original page objects.
 * setExpression never transfers the SugarCube graph into our extension.
 */
export const variableRoots = [
  {
    title: "SugarCube Story",
    rootTitle: "Story variables ($)",
    expression: "globalThis.SugarCube?.State?.variables",
  },
  {
    title: "SugarCube Temporary",
    rootTitle: "Temporary variables (_)",
    expression: "globalThis.SugarCube?.State?.temporary",
  },
] as const;

export interface NativeSidebar {
  setExpression(expression: string, rootTitle?: string): Promise<void> | void;
  onShown: { addListener(listener: () => void): void };
}

export interface NativeInspectorHost {
  createSidebarPane(title: string): Promise<NativeSidebar>;
  createPanel(): Promise<unknown>;
  onNavigated(listener: () => void): void;
  onRefreshRequested(listener: () => Promise<void>): void;
}

export async function registerNativeInspector(host: NativeInspectorHost): Promise<void> {
  const panes = await Promise.all(
    variableRoots.map((root) => host.createSidebarPane(root.title)),
  );

  const update = async (index: number): Promise<void> => {
    const root = variableRoots[index]!;
    await panes[index]!.setExpression(root.expression, root.rootTitle);
  };
  const refresh = async (): Promise<void> => {
    await Promise.all(variableRoots.map((_, index) => update(index)));
  };
  const refreshQuietly = (): void => {
    void refresh().catch(console.error);
  };

  panes.forEach((pane, index) => {
    pane.onShown.addListener(() => { void update(index).catch(console.error); });
  });
  host.onNavigated(refreshQuietly);
  host.onRefreshRequested(refresh);

  // Initialize the views even before the user selects the Elements sidebar.
  await refresh();
  await host.createPanel();
}
