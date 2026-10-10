import { isPathPrefix, pathToKey } from "../variables/path";
import type { VariablePath } from "./types";

export function collectionPaths(paths: readonly VariablePath[]): VariablePath[] {
  const collections = new Map<string, VariablePath>();
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      const part = path[index]!;
      if (part.type !== "mapKey" && part.type !== "mapValue" && part.type !== "setValue") continue;
      const collection = path.slice(0, index) as VariablePath;
      collections.set(pathToKey(collection), collection);
    }
  }
  // An outer collection replacement supersedes all its descendant updates.
  return [...collections.values()].sort((a, b) => a.length - b.length);
}

export function structurePaths(visible: readonly VariablePath[]): VariablePath[] {
  const paths = new Map<string, VariablePath>();
  for (const path of visible) {
    // Explicit root registrations are structure-only, including when empty.
    if (path.length === 1) {
      paths.set(pathToKey(path), path);
      continue;
    }

    // A visible child's parent discovers its siblings, including children
    // of Map/Set entries when their positions are still stable.
    const parent = path.slice(0, -1) as VariablePath;
    paths.set(pathToKey(parent), parent);
  }
  return [...paths.values()];
}


/** Keep requested paths intact, deduplicating them and discarding descendants of watched ancestors. */
export function minimizeWatchPaths(paths: VariablePath[]): VariablePath[] {
  const unique = [...new Map(paths.map((path) => [pathToKey(path), path])).values()];
  return unique.filter(
    (path) => !unique.some((other) => other !== path && isPathPrefix(other, path)),
  );
}
