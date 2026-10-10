// @vitest-environment happy-dom

import { cleanup, fireEvent, render as renderRTL, screen } from "@testing-library/react";
import { createSnapshotFixture } from "../../../tests/fixtures";
import { WatchProvider } from "../watch/WatchProvider";
import type { VariableScope } from "../../sugarcube/watch/types";
import { afterEach, describe, expect, it } from "vitest";
import VariableTree from "./VariableTree";

afterEach(cleanup);

function renderTree(scope: VariableScope, variables: Record<string, unknown>) {
  const snapshot = createSnapshotFixture();
  Object.assign(snapshot.variables, { [scope]: variables });
  return renderRTL(
    <WatchProvider snapshot={snapshot}>
      <VariableTree scope={scope} />
    </WatchProvider>,
  );
}

describe("variable tree", () => {
  it.each(["story", "temporary"] as const)(
    "shows an empty state for %s variables",
    (scope) => {
      renderTree(scope, {});

      expect(screen.getByText("No variables")).toBeDefined();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("renders top-level variables and offers expansion even for empty containers", () => {
    renderTree("story", { score: 7, enabled: false, empty: {}, inventory: ["map"] });

    expect(screen.getByText("score")).toBeDefined();
    expect(screen.getByTitle("7")).toBeDefined();
    expect(screen.getByTitle("false")).toBeDefined();
    expect(screen.getByTitle("0 properties")).toBeDefined();
    expect(screen.queryByText("$")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Expand / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Favorite score" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Expand empty" }));
    expect(screen.getByRole("button", { name: "Collapse empty" })).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "Expand inventory" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTitle('"map"')).toBeNull();
  });

  it("ignores the second click of a double-click when favoriting a variable", () => {
    renderTree("story", { score: 7 });

    const button = screen.getByRole("button", { name: "Favorite score" });
    fireEvent.click(button, { detail: 1 });
    expect(button.getAttribute("aria-label")).toBe("Unfavorite score");

    fireEvent.click(button, { detail: 2 });
    expect(button.getAttribute("aria-label")).toBe("Unfavorite score");

    fireEvent.click(button, { detail: 1 }); // A new click sequence.
    expect(button.getAttribute("aria-label")).toBe("Favorite score");
  });

  it("expands and collapses nested arrays while retaining the child expansion state", () => {
    renderTree("story", { inventory: ["map", { charges: 3 }] });

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
    const { rerender } = renderTree("story", { hero: { hp: 10 }, bag: ["map"] });
    fireEvent.click(screen.getByRole("button", { name: "Expand hero" }));

    const updated = createSnapshotFixture();
    updated.variables.story = { added: true, bag: ["torch"], hero: { hp: 6 } };
    rerender(
      <WatchProvider snapshot={updated}>
        <VariableTree scope="story" />
      </WatchProvider>,
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
    renderTree("story", { "a.b": { marker: "literal" }, a: { b: { marker: "nested" } } });

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
    renderTree("story", { lookup: new Map([[key, value]]) });
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
    renderTree("story", { inventory });
    fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));

    expect(
      screen
        .getAllByRole("button", { name: /^(Expand|Collapse) / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Collapse inventory", "Expand [0]", "Expand [1]"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand [1]" }));
    expect(screen.getByTitle('"key"')).toBeDefined();
    expect(screen.queryByTitle('"map"')).toBeNull();
  });

  it("marks circular ancestors as leaves instead of recursing indefinitely", () => {
    const loop: Record<string, unknown> = { score: 7 };
    loop.self = loop;
    renderTree("story", { loop });
    fireEvent.click(screen.getByRole("button", { name: "Expand loop" }));

    expect(screen.getByText("self")).toBeDefined();
    const link = screen.getByRole("button", { name: "Go to $loop" });
    expect(screen.queryByRole("button", { name: "Expand self" })).toBeNull();
    expect(screen.getByTitle("7")).toBeDefined();

    const ancestorRow = screen.getByRole("button", { name: "Collapse loop" }).parentElement!.parentElement!;
    fireEvent.click(link);
    expect(document.activeElement).toBe(ancestorRow);
  });

  it("navigates root-level circular references back to the scope root", () => {
    const variables: Record<string, unknown> = { score: 7 };
    variables.self = variables;
    const { container } = renderTree("story", variables);

    const link = screen.getByRole("button", { name: "Go to $" });
    expect(screen.queryByRole("button", { name: "Expand self" })).toBeNull();
    fireEvent.click(link);

    const root = container.querySelector('[tabindex="-1"]');
    expect(document.activeElement).toBe(root);
    expect(screen.getByText("score")).toBeDefined();
  });

  it("navigates a nested circular reference to the exact ancestor row", () => {
    const player: Record<string, unknown> = { hp: 12 };
    const inventory = { owner: player };
    player.inventory = inventory;
    renderTree("story", { player });
    fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand inventory" }));

    const link = screen.getByRole("button", { name: "Go to $player" });
    const playerRow = screen.getByRole("button", { name: "Collapse player" }).parentElement!.parentElement!;
    fireEvent.click(link);
    expect(document.activeElement).toBe(playerRow);
  });

  it("allows the same object under different siblings without treating it as circular", () => {
    const shared = { item: "map" };
    renderTree("story", { left: shared, right: shared });
    fireEvent.click(screen.getByRole("button", { name: "Expand left" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand right" }));

    expect(screen.getAllByTitle('"map"')).toHaveLength(2);
    expect(screen.queryByText("[Circular]")).toBeNull();
  });
});
