// @vitest-environment happy-dom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createSnapshotFixture } from "../../tests/fixtures";
import Variables from "./Variables";

afterEach(cleanup);

function getTabs() {
  return {
    story: screen.getByRole("tab", { name: "Story Variables" }),
    temporary: screen.getByRole("tab", { name: "Temporary Variables" }),
  };
}

describe("variable scope tabs", () => {
  it("selects story variables by default and associates each tab with its panel", () => {
    render(<Variables snapshot={createSnapshotFixture()} />);
    const tabs = getTabs();

    expect(
      screen.getByRole("tablist", { name: "Variable scope" }),
    ).toBeDefined();
    expect(tabs.story.getAttribute("aria-selected")).toBe("true");
    expect(tabs.temporary.getAttribute("aria-selected")).toBe("false");
    expect(tabs.story.tabIndex).toBe(0);
    expect(tabs.temporary.tabIndex).toBe(-1);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    for (const [scope, tab] of Object.entries(tabs)) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panel?.hidden).toBe(scope !== "story");
    }
    const panel = screen.getByRole("tabpanel", { name: "Story Variables" });
    expect(within(panel).getByText("score")).toBeDefined();
    expect(within(panel).queryByText("choice")).toBeNull();
  });

  it("switches the visible panel and roving tab stop when a tab is clicked", () => {
    render(<Variables snapshot={createSnapshotFixture()} />);
    const tabs = getTabs();

    fireEvent.click(tabs.temporary);

    expect(tabs.temporary.getAttribute("aria-selected")).toBe("true");
    expect(tabs.temporary.tabIndex).toBe(0);
    expect(tabs.story.getAttribute("aria-selected")).toBe("false");
    expect(tabs.story.tabIndex).toBe(-1);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    const panel = screen.getByRole("tabpanel", { name: "Temporary Variables" });
    expect(within(panel).getByText("choice")).toBeDefined();
    expect(within(panel).queryByText("score")).toBeNull();

    fireEvent.click(tabs.story);
    expect(
      screen.getByRole("tabpanel", { name: "Story Variables" }),
    ).toBeDefined();
    expect(tabs.story.tabIndex).toBe(0);
  });

  it.each(["ArrowLeft", "ArrowRight"])(
    "wraps selection and focus with %s",
    (key) => {
      render(<Variables snapshot={createSnapshotFixture()} />);
      const tabs = getTabs();
      tabs.story.focus();

      fireEvent.keyDown(tabs.story, { key });
      expect(document.activeElement).toBe(tabs.temporary);
      expect(tabs.temporary.getAttribute("aria-selected")).toBe("true");
      expect(
        screen.getByRole("tabpanel", { name: "Temporary Variables" }),
      ).toBeDefined();

      fireEvent.keyDown(tabs.temporary, { key });
      expect(document.activeElement).toBe(tabs.story);
      expect(tabs.story.getAttribute("aria-selected")).toBe("true");
      expect(
        screen.getByRole("tabpanel", { name: "Story Variables" }),
      ).toBeDefined();
    },
  );

  it("selects and focuses the last and first tabs with End and Home", () => {
    render(<Variables snapshot={createSnapshotFixture()} />);
    const tabs = getTabs();
    tabs.story.focus();

    fireEvent.keyDown(tabs.story, { key: "End" });
    expect(document.activeElement).toBe(tabs.temporary);
    expect(tabs.temporary.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tabs.temporary, { key: "Home" });
    expect(document.activeElement).toBe(tabs.story);
    expect(tabs.story.getAttribute("aria-selected")).toBe("true");
  });

  it("leaves selection and focus unchanged for unrelated keys", () => {
    render(<Variables snapshot={createSnapshotFixture()} />);
    const tabs = getTabs();
    tabs.story.focus();

    fireEvent.keyDown(tabs.story, { key: "ArrowDown" });

    expect(document.activeElement).toBe(tabs.story);
    expect(tabs.story.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("tabpanel", { name: "Story Variables" }),
    ).toBeDefined();
  });

  it("preserves selection and separate expansion state through scope changes and fresh snapshots", () => {
    const snapshot = createSnapshotFixture();
    snapshot.variables.temporary.inventory = ["compass"];
    const { rerender } = render(<Variables snapshot={snapshot} />);
    const tabs = getTabs();
    const storyPanel = screen.getByRole("tabpanel", {
      name: "Story Variables",
    });
    fireEvent.click(
      within(storyPanel).getByRole("button", { name: "Expand inventory" }),
    );
    expect(within(storyPanel).getByTitle('"map"')).toBeDefined();

    fireEvent.click(tabs.temporary);
    const temporaryPanel = screen.getByRole("tabpanel", {
      name: "Temporary Variables",
    });
    expect(within(temporaryPanel).queryByTitle('"compass"')).toBeNull();
    fireEvent.click(
      within(temporaryPanel).getByRole("button", { name: "Expand inventory" }),
    );

    const updated = createSnapshotFixture("Next Passage");
    Object.assign(updated.variables.story, { inventory: ["torch"] });
    updated.variables.temporary.inventory = ["rope"];
    rerender(<Variables snapshot={updated} />);

    expect(tabs.temporary.getAttribute("aria-selected")).toBe("true");
    expect(within(temporaryPanel).getByTitle('"rope"')).toBeDefined();
    expect(
      within(temporaryPanel)
        .getByRole("button", { name: "Collapse inventory" })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    fireEvent.click(tabs.story);
    expect(within(storyPanel).getByTitle('"torch"')).toBeDefined();
    expect(within(storyPanel).queryByTitle('"map"')).toBeNull();
    expect(
      within(storyPanel)
        .getByRole("button", { name: "Collapse inventory" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps tab and panel associations unique between inspector instances", () => {
    const first = render(<Variables snapshot={createSnapshotFixture()} />);
    const second = render(<Variables snapshot={createSnapshotFixture()} />);
    const ids: string[] = [];

    for (const container of [first.container, second.container]) {
      for (const tab of within(container).getAllByRole("tab")) {
        const panel = document.getElementById(
          tab.getAttribute("aria-controls")!,
        );
        expect(panel).not.toBeNull();
        expect(container.contains(panel)).toBe(true);
        expect(panel!.getAttribute("aria-labelledby")).toBe(tab.id);
        ids.push(tab.id, panel!.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
