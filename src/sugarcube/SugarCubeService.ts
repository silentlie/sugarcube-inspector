import type { SugarCubeObject } from "twine-sugarcube";
import type { SugarCubeSnapshot, SugarCubeVariables } from "./types";
import { resolvePath, type PathResolution } from "./variables/path";
import type { VariablePath } from "./watch/types";

/** MAIN-world gateway to the current SugarCube runtime. */
export class SugarCubeService {
  constructor(private readonly sugarcube: SugarCubeObject) {}

  get variables(): SugarCubeVariables {
    // SugarCube may replace these stores when navigating or restoring state.
    return {
      story: this.sugarcube.State.variables,
      temporary: this.sugarcube.State.temporary,
    };
  }

  resolveVariable(path: VariablePath): PathResolution {
    return resolvePath(this.variables, path);
  }

  createSnapshot(): SugarCubeSnapshot {
    const { State, Story, version } = this.sugarcube;
    const passage = State.passage;

    return structuredClone({
      story: {
        name: Story.name || Story.title || "Unknown Story",
        ifId: Story.ifId,
        version: version.toString(),
      },
      passage: {
        name: passage,
        tags: [...Story.get(passage).tags],
      },
      history: {
        turns: State.turns,
        length: State.length,
      },
      variables: {
        story: State.variables,
        temporary: State.temporary,
      },
      capturedAt: Date.now(),
    });
  }
}
