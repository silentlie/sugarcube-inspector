// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveVariableTree, type InspectChildren } from "./LiveVariableTree";
import type { InspectResult } from "./lazyInspection";

const result = (entries: InspectResult["entries"], total = entries.length): InspectResult => ({
  entries, total, offset: 0,
});

afterEach(cleanup);

describe("SugarCube panel live variable tree", () => {
  it("shows both variable scopes and lazily expands object properties", async () => {
    const inspect: InspectChildren = vi.fn(async (path) => {
      if (path.root === "temporary") return result([
        { name: "choice", segment: { kind: "property", key: "choice" }, preview: '"north"', expandable: false },
      ]);
      if (path.segments.length === 0) return result([
        { name: "day", segment: { kind: "property", key: "day" }, preview: "2", expandable: false },
        { name: "party", segment: { kind: "property", key: "party" }, preview: "Object", expandable: true },
        { name: "getter", segment: { kind: "property", key: "getter" }, preview: "[getter]", expandable: false, accessor: "getter" },
      ]);
      return result([
        { name: "leader", segment: { kind: "property", key: "leader" }, preview: '"MC"', expandable: false },
      ]);
    });
    render(<LiveVariableTree inspect={inspect}/>);

    expect(await screen.findByText("day")).toBeDefined();
    expect(screen.getByText("choice")).toBeDefined();
    expect(screen.queryByText("leader")).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand getter" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Expand party" }));
    });
    expect(await screen.findByText("leader")).toBeDefined();
    expect(inspect).toHaveBeenCalledWith({
      root: "story",
      segments: [{ kind: "property", key: "party" }],
    }, 0);
  });

  it("paginates large variable stores", async () => {
    const first = result([
      { name: "a", segment: { kind: "property", key: "a" }, preview: "1", expandable: false },
    ], 2);
    const last = result([
      { name: "b", segment: { kind: "property", key: "b" }, preview: "2", expandable: false },
    ], 2);
    const inspect: InspectChildren = vi.fn(async (path, offset) =>
      path.root === "temporary" ? result([]) : offset ? last : first);
    render(<LiveVariableTree inspect={inspect}/>);
    expect(await screen.findByText("a")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Load more (1/2)" }));
    await waitFor(() => expect(screen.getByText("b")).toBeDefined());
    expect(inspect).toHaveBeenCalledWith({ root: "story", segments: [] }, 1);
  });

  it("reports a failed variable lookup without breaking the whole panel", async () => {
    const inspect: InspectChildren = async (path) => {
      if (path.root === "story") throw new Error("Stale path");
      return result([]);
    };
    render(<LiveVariableTree inspect={inspect}/>);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Stale path");
    expect(screen.getByText("Temporary variables (_)")).toBeDefined();
  });
});
