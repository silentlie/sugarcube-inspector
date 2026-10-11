import { describe, expect, it } from "vitest";
import type { SugarCubeObject } from "twine-sugarcube";
import { createSugarCubeFixture } from "../../tests/fixtures";
import { SugarCubeService } from "./SugarCubeService";
import type { VariablePath } from "./watch/types";

const score: VariablePath = [
  { type: "property", key: "story" },
  { type: "property", key: "score" },
];

describe("SugarCube runtime access", () => {
  it("reads from the current State variable stores rather than retaining stale references", () => {
    const runtime = createSugarCubeFixture();
    const service = new SugarCubeService(runtime as unknown as SugarCubeObject);

    expect(service.resolveVariable(score)).toEqual({ status: "found", value: 7 });

    const nextStory = { score: 42 };
    const nextTemporary = { choice: "south" };
    runtime.State.variables = nextStory;
    runtime.State.temporary = nextTemporary;

    expect(service.variables.story).toBe(nextStory);
    expect(service.variables.temporary).toBe(nextTemporary);
    expect(service.resolveVariable(score)).toEqual({ status: "found", value: 42 });
  });

  it("clones snapshots and reads passage information at the time of capture", () => {
    const runtime = createSugarCubeFixture();
    const service = new SugarCubeService(runtime as unknown as SugarCubeObject);

    const snapshot = service.createSnapshot();
    expect(snapshot.story.name).toBe("Test Story");
    expect(snapshot.passage.name).toBe("Start");
    expect(snapshot.variables.story).not.toBe(runtime.State.variables);

    Object.assign(snapshot.variables.story, { score: 99 });
    expect(runtime.State.variables.score).toBe(7);

    runtime.State.passage = "Next Passage";
    runtime.State.variables = { score: 12 };
    const next = service.createSnapshot();
    expect(next.passage.name).toBe("Next Passage");
    expect(next.variables.story).toHaveProperty("score", 12);
  });
});
