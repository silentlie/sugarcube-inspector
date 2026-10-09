import { describe, expect, it } from "vitest";
import { createSnapshotFixture } from "../../tests/fixtures";
import { SugarCubeSnapshotSchema } from "./types";

describe("SugarCubeSnapshotSchema", () => {
  const snapshot = createSnapshotFixture();

  it("accepts a complete snapshot without changing its data", () => {
    expect(SugarCubeSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("allows an omitted version, empty variables and tags, and zero history", () => {
    const minimalSnapshot = {
      ...snapshot,
      story: { name: "Test Story", ifId: snapshot.story.ifId },
      passage: { name: "Start", tags: [] },
      history: { turns: 0, length: 0 },
      variables: { story: {}, temporary: {} },
    };

    expect(SugarCubeSnapshotSchema.parse(minimalSnapshot)).toEqual(
      minimalSnapshot,
    );
  });

  it("preserves arbitrary variable values, including cycles and collection types", () => {
    const story: Record<string, unknown> = {
      list: [1, null, { nested: true }],
      date: new Date("2026-10-09T00:00:00Z"),
      map: new Map([["score", 7]]),
      set: new Set(["map"]),
      missing: undefined,
    };
    story.self = story;

    const temporary = Object.assign(Object.create(null), { choice: "north" });
    const parsed = SugarCubeSnapshotSchema.parse({
      ...snapshot,
      variables: { story, temporary },
    });

    expect(parsed.variables.story).toBe(story);
    expect(parsed.variables.temporary).toBe(temporary);
  });

  it.each([
    { name: "null", value: null },
    { name: "an array", value: [] },
    { name: "an empty object", value: {} },
  ])("rejects $name as the snapshot", ({ value }) => {
    expect(SugarCubeSnapshotSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    {
      name: "a missing story",
      value: { ...snapshot, story: undefined },
      path: ["story"],
    },
    {
      name: "a non-string story name",
      value: { ...snapshot, story: { ...snapshot.story, name: 7 } },
      path: ["story", "name"],
    },
    {
      name: "a missing story identifier",
      value: { ...snapshot, story: { ...snapshot.story, ifId: undefined } },
      path: ["story", "ifId"],
    },
    {
      name: "a non-string version",
      value: { ...snapshot, story: { ...snapshot.story, version: 2 } },
      path: ["story", "version"],
    },
    {
      name: "a missing passage",
      value: { ...snapshot, passage: undefined },
      path: ["passage"],
    },
    {
      name: "a non-string passage name",
      value: { ...snapshot, passage: { ...snapshot.passage, name: null } },
      path: ["passage", "name"],
    },
    {
      name: "tags that are not an array",
      value: { ...snapshot, passage: { ...snapshot.passage, tags: "intro" } },
      path: ["passage", "tags"],
    },
    {
      name: "a non-string tag",
      value: { ...snapshot, passage: { ...snapshot.passage, tags: ["intro", 1] } },
      path: ["passage", "tags", 1],
    },
    {
      name: "a missing history",
      value: { ...snapshot, history: undefined },
      path: ["history"],
    },
    {
      name: "missing variables",
      value: { ...snapshot, variables: undefined },
      path: ["variables"],
    },
    {
      name: "a non-numeric capture time",
      value: { ...snapshot, capturedAt: "now" },
      path: ["capturedAt"],
    },
    {
      name: "a missing capture time",
      value: { ...snapshot, capturedAt: undefined },
      path: ["capturedAt"],
    },
  ])("rejects $name and identifies the invalid field", ({ value, path }) => {
    const result = SugarCubeSnapshotSchema.safeParse(value);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(path);
    }
  });

  describe.each(["turns", "length"] as const)("history.%s", (field) => {
    it.each([-1, 1.5, "2", null, undefined, NaN, Infinity])(
      "rejects %s instead of a nonnegative integer",
      (value) => {
        expect(
          SugarCubeSnapshotSchema.safeParse({
            ...snapshot,
            history: { ...snapshot.history, [field]: value },
          }).success,
        ).toBe(false);
      },
    );
  });

  describe.each(["story", "temporary"] as const)("variables.%s", (field) => {
    it.each([null, undefined, [], "text", 7, false])(
      "rejects %s instead of a variable container",
      (value) => {
        expect(
          SugarCubeSnapshotSchema.safeParse({
            ...snapshot,
            variables: { ...snapshot.variables, [field]: value },
          }).success,
        ).toBe(false);
      },
    );
  });

  it.each([NaN, Infinity, -Infinity])(
    "rejects a non-finite capture time of %s",
    (capturedAt) => {
      expect(
        SugarCubeSnapshotSchema.safeParse({ ...snapshot, capturedAt }).success,
      ).toBe(false);
    },
  );
});
