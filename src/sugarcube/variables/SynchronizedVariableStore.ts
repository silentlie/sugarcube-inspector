import { applyWatchPatches } from "./applyWatchPatches";
import { resolvePath, type PathResolution } from "./path";
import type { SugarCubeSnapshot, SugarCubeVariables } from "../types";
import type { VariablePath, WatchPatch } from "../watch/types";

/** MAIN's private mutable last-synchronized graph, not the live SugarCube graph. */
export class SynchronizedVariableStore {
  private variables: SugarCubeVariables | null = null;
  private currentGeneration = 0;

  get hasSnapshot(): boolean {
    return this.variables !== null;
  }

  get generation(): number {
    return this.currentGeneration;
  }

  capture(snapshot: SugarCubeSnapshot): number {
    // The page bridge already cloned the snapshot.
    this.variables = snapshot.variables;
    return ++this.currentGeneration;
  }

  read(path: VariablePath): PathResolution {
    if (!this.variables) throw new Error("No synchronized snapshot has been captured.");
    return resolvePath(this.variables, path);
  }

  apply(changes: WatchPatch[]): void {
    if (!this.variables) throw new Error("No synchronized snapshot has been captured.");
    if (changes.length) applyWatchPatches(this.variables, changes);
  }
}
