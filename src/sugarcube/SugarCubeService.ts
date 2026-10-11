import type { SugarCubeObject } from "twine-sugarcube";
import { createSugarCubeSnapshot } from "./snapshot";
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
    return structuredClone(createSugarCubeSnapshot(this.sugarcube));
  }
}
