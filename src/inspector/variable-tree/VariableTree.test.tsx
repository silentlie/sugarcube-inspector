// @vitest-environment happy-dom

import { cleanup, fireEvent, render as renderRTL, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider } from "../watch/WatchProvider";
import { afterEach, describe, expect, it } from "vitest";
import VariableTree from "./VariableTree";

afterEach(cleanup);

function render(ui: ReactElement) {
  return renderRTL(ui, {
    wrapper: ({ children }) => (
      <WatchProvider snapshot={createSnapshotFixture()}>{children}</WatchProvider>
    ),
  });
}

describe("variable tree", () => {
  it.each(["story", "temporary"] as const)(
    "shows an empty state for %s variables",
    (scope) => {
      render(<VariableTree scope={scope} value={{}} />);

      expect(screen.getByText("No variables")).toBeDefined();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("renders top-level variables directly and only offers expansion for containers with children", () => {
    render(
      <VariableTree
        scope="story"
        value={{ score: 7, enabled: false, empty: {}, inventory: ["map"] }}
      />,
    );

    expect(screen.getByText("score")).toBeDefined();
    expect(screen.getByTitle("7")).toBeDefined();
    expect(screen.getByTitle("false")).toBeDefined();
    expect(screen.getByTitle("0 properties")).toBeDefined();
    expect(screen.queryByText("$")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: "Expand inventory" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTitle('"map"')).toBeNull();
  });

  it("expands and collapses nested arrays while retaining the child expansion state", () => {
    render(
      <VariableTree
        scope="story"
        value={{ inventory: ["map", { charges: 3 }] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));
    expect(screen.getByText("[0]")).toBeDefined();
    expect(screen.getByTitle('"map"')).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Expand [1]" }));
    expect(screen.getByText("charges")).toBeDefined();
    expect(screen.getByTitle("3")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse inventory" }));
    expect(screen.queryByText("charges")).toBeNull();
    expect(screen.queryByTitle('"map"')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));
    expect(
      screen
        .getByRole("button", { name: "Collapse [1]" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTitle("3")).toBeDefined();
  });

  it("keeps expanded property paths when a cloned snapshot changes values and property order", () => {
    const { rerender } = render(
      <VariableTree scope="story" value={{ hero: { hp: 10 }, bag: ["map"] }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand hero" }));

    rerender(
      <VariableTree
        scope="story"
        value={{ added: true, bag: ["torch"], hero: { hp: 6 } }}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Collapse hero" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTitle("6")).toBeDefined();
    expect(screen.queryByTitle("10")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Expand bag" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTitle('"torch"')).toBeNull();
  });

  it("does not confuse a literal dotted property with a nested property path", () => {
    render(
      <VariableTree
        scope="story"
        value={{ "a.b": { marker: "literal" }, a: { b: { marker: "nested" } } }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand a.b" }));
    expect(screen.getByTitle('"literal"')).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Expand a" }));
    expect(
      screen
        .getByRole("button", { name: "Expand b" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTitle('"nested"')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand b" }));
    expect(screen.getByTitle('"nested"')).toBeDefined();
    expect(screen.getByTitle('"literal"')).toBeDefined();
  });

  it("expands Map keys and values independently", () => {
    const key = { keyName: "door" };
    const value = { valueName: "unlocked" };
    render(
      <VariableTree
        scope="story"
        value={{ lookup: new Map([[key, value]]) }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand lookup" }));

    fireEvent.click(screen.getByRole("button", { name: "Expand [0].key" }));
    expect(screen.getByTitle('"door"')).toBeDefined();
    expect(screen.queryByTitle('"unlocked"')).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Expand [0].value" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Expand [0].value" }));
    expect(screen.getByTitle('"unlocked"')).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Collapse [0].key" }));
    expect(screen.queryByTitle('"door"')).toBeNull();
    expect(screen.getByTitle('"unlocked"')).toBeDefined();
  });

  it("renders Set entries in insertion order and expands each entry separately", () => {
    const inventory = new Set([{ item: "map" }, { item: "key" }]);
    render(<VariableTree scope="story" value={{ inventory }} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Collapse inventory", "Expand [0]", "Expand [1]"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand [1]" }));
    expect(screen.getByTitle('"key"')).toBeDefined();
    expect(screen.queryByTitle('"map"')).toBeNull();
  });

  it("marks circular ancestors as leaves instead of recursing indefinitely", () => {
    const loop: Record<string, unknown> = { score: 7 };
    loop.self = loop;
    render(<VariableTree scope="story" value={{ loop }} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand loop" }));

    expect(screen.getByText("self")).toBeDefined();
    expect(screen.getByText("[Circular]")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Expand self" })).toBeNull();
    expect(screen.getByTitle("7")).toBeDefined();
  });

  it("allows the same object under different siblings without treating it as circular", () => {
    const shared = { item: "map" };
    render(
      <VariableTree scope="story" value={{ left: shared, right: shared }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand left" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand right" }));

    expect(screen.getAllByTitle('"map"')).toHaveLength(2);
    expect(screen.queryByText("[Circular]")).toBeNull();
  });
});
