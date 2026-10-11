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
  onNavigated(listener: () => void): void;
}

/**
 * Create both sidebars in the same DevTools panel context as the controls.
 * Returns a refresh operation that queues live evaluations without waiting for
 * a hidden Elements sidebar to finish rendering.
 */
export async function registerNativeInspector(
  host: NativeInspectorHost,
): Promise<() => void> {
  const panes = await Promise.all(
    variableRoots.map((root) => host.createSidebarPane(root.title)),
  );

  const update = (index: number): void => {
    const root = variableRoots[index]!;
    try {
      void Promise.resolve(panes[index]!.setExpression(root.expression, root.rootTitle))
        .catch(console.error);
    } catch (error) {
      console.error(error);
    }
  };
  const refresh = (): void => {
    variableRoots.forEach((_, index) => update(index));
  };

  panes.forEach((pane, index) => {
    pane.onShown.addListener(() => update(index));
  });
  host.onNavigated(refresh);
  refresh();

  return refresh;
}
