import { describe, expect, it, vi } from "vitest";
import { registerNativeInspector, variableRoots, type NativeSidebar } from "./nativeInspector";

function setup() {
  const shown: Array<() => void> = [];
  const evaluated: Array<[string, string | undefined]> = [];
  const panes: NativeSidebar[] = variableRoots.map(() => ({
    setExpression: vi.fn(async (expression: string, title?: string) => {
      evaluated.push([expression, title]);
    }),
    onShown: { addListener: vi.fn((listener: () => void) => { shown.push(listener); }) },
  }));
  let onNavigated: (() => void) | undefined;
  let onRefresh: (() => Promise<void>) | undefined;
  const host = {
    createSidebarPane: vi.fn(async (name: string) => panes[
      name === variableRoots[0].title ? 0 : 1
    ]!),
    createPanel: vi.fn(async () => ({})),
    onNavigated: vi.fn((listener: () => void) => { onNavigated = listener; }),
    onRefreshRequested: vi.fn((listener: () => Promise<void>) => { onRefresh = listener; }),
  };
  return { host, panes, evaluated, shown, navigate: () => onNavigated?.(), refresh: () => onRefresh?.() };
}

describe("DevTools native SugarCube object inspection", () => {
  it("registers story and temporary sidebars and a DevTools panel", async () => {
    const test = setup();
    await registerNativeInspector(test.host);

    expect(test.host.createSidebarPane.mock.calls.map(([name]) => name))
      .toEqual(["SugarCube Story", "SugarCube Temporary"]);
    expect(test.host.createPanel).toHaveBeenCalledTimes(1);
    expect(test.evaluated).toEqual(variableRoots.map(root => [root.expression, root.rootTitle]));
    expect(test.evaluated[0]![0]).toBe("globalThis.SugarCube?.State?.variables");
    expect(test.evaluated[1]![0]).toBe("globalThis.SugarCube?.State?.temporary");
    // No evaluation result or cloned game object is transferred back to the extension.
  });

  it("refreshes live expressions on sidebar selection, navigation, and manual request", async () => {
    const test = setup();
    await registerNativeInspector(test.host);

    test.shown[0]?.();
    await vi.waitFor(() => expect(test.evaluated).toHaveLength(3));
    expect(test.evaluated[2]).toEqual([variableRoots[0].expression, variableRoots[0].rootTitle]);

    test.navigate();
    await vi.waitFor(() => expect(test.evaluated).toHaveLength(5));
    await test.refresh();
    expect(test.evaluated).toHaveLength(7);
  });
});
