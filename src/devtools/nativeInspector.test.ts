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
  const host = {
    createSidebarPane: vi.fn(async (name: string) => panes[
      name === variableRoots[0].title ? 0 : 1
    ]!),
    onNavigated: vi.fn((listener: () => void) => { onNavigated = listener; }),
  };
  return { host, panes, evaluated, shown, navigate: () => onNavigated?.() };
}

describe("DevTools native SugarCube object inspection", () => {
  it("registers both live variable sidebars without remote messaging", async () => {
    const test = setup();
    const refresh = await registerNativeInspector(test.host);

    expect(test.host.createSidebarPane.mock.calls.map(([name]) => name))
      .toEqual(["SugarCube Story", "SugarCube Temporary"]);
    expect(test.evaluated).toEqual(variableRoots.map(root => [root.expression, root.rootTitle]));
    expect(test.evaluated[0]![0]).toBe("globalThis.SugarCube?.State?.variables");
    expect(test.evaluated[1]![0]).toBe("globalThis.SugarCube?.State?.temporary");

    refresh();
    expect(test.evaluated).toHaveLength(4);
  });

  it("refreshes on sidebar selection and navigation", async () => {
    const test = setup();
    await registerNativeInspector(test.host);

    test.shown[0]?.();
    await vi.waitFor(() => expect(test.evaluated).toHaveLength(3));
    expect(test.evaluated[2]).toEqual([variableRoots[0].expression, variableRoots[0].rootTitle]);

    test.navigate();
    await vi.waitFor(() => expect(test.evaluated).toHaveLength(5));
  });

  it("returns a refresh callback without waiting for hidden Elements panes", async () => {
    const test = setup();
    test.panes.forEach(pane => {
      vi.spyOn(pane, "setExpression").mockImplementation(() => new Promise<void>(() => {}));
    });

    const refresh = await registerNativeInspector(test.host);
    expect(refresh).toBeTypeOf("function");
    expect(() => refresh()).not.toThrow();
    expect(test.panes[0]!.setExpression).toHaveBeenCalledTimes(2);
  });
});
