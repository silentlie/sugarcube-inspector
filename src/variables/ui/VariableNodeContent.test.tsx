// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VariableSnapshot } from "../location";
import type { VariableNode } from "../nodes";
import { VariableNodeContent } from "./VariableNodeContent";

const useVariableMock = vi.hoisted(() => vi.fn());

vi.mock("./useVariableWatch", () => ({
  useVariable: useVariableMock,
}));

afterEach(() => {
  cleanup();
  useVariableMock.mockReset();
});

function makeNode(name: string, value: unknown): VariableNode {
  return {
    key: 3,
    location: { kind: "property", owner: { [name]: value }, key: name },
    ancestors: [],
    isLeaf: typeof value !== "object" || value === null,
  };
}

describe("variable node title layout and expansion", () => {
  it("displays the type as a TypeScript-style annotation beside the key", () => {
    useVariableMock.mockReturnValue({
      kind: "value", value: 1, type: "number", preview: "1",
    } satisfies VariableSnapshot);

    const { container } = render(
      <VariableNodeContent
        node={makeNode("day", 1)} refresh={vi.fn()}
        expanded={false} onToggle={vi.fn()}
      />,
    );

    const row = container.firstElementChild;
    expect(row?.textContent).toBe("day: number1");
    expect(row?.getAttribute("role")).toBeNull();
    expect(screen.getByTitle("1")).not.toBeNull();
  });

  it("toggles expandable titles with click, Enter, or Space", () => {
    const value = { nested: true };
    useVariableMock.mockReturnValue({
      kind: "value", value, type: "Object", preview: "Object",
    } satisfies VariableSnapshot);
    const toggle = vi.fn();
    render(
      <VariableNodeContent
        node={makeNode("settings", value)} refresh={vi.fn()}
        expanded={false} onToggle={toggle}
      />,
    );

    const row = screen.getByRole("button", { expanded: false });
    expect(row.textContent).toContain("settings: Object");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(toggle).toHaveBeenCalledTimes(3);
  });

  it("keeps map-key arrows and annotates the map value type", () => {
    const owner = new Map<unknown, unknown>([["entry", 42]]);
    useVariableMock.mockImplementation((location: { part?: string }) =>
      location.part === "key"
        ? { kind: "value", value: "entry", type: "string", preview: '"entry"' }
        : { kind: "value", value: 42, type: "number", preview: "42" });
    const node: VariableNode = {
      key: 4, location: { kind: "map", owner, key: "entry" },
      ancestors: [], isLeaf: false,
    };
    const { container } = render(
      <VariableNodeContent
        node={node} refresh={vi.fn()}
        expanded={false} onToggle={vi.fn()}
      />,
    );
    const rowText = container.firstElementChild?.textContent;
    expect(rowText).toContain("→");
    expect(rowText).toContain("number");
    expect(rowText).toContain("42");
  });
});
