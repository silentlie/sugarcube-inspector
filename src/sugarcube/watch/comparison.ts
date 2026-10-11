import { circularDeepEqual, deepEqual } from "fast-equals";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import { pathToKey, type PathKey, type PathResolution } from "../variables/path";

export function sameValue(
  previous: unknown,
  current: unknown,
  key: PathKey,
  circularPaths: Set<PathKey>,
): boolean {
  if (Object.is(previous, current)) return true;
  if (!isNonFunctionObject(previous) || !isNonFunctionObject(current)) {
    return false;
  }
  if (circularPaths.has(key)) return circularDeepEqual(previous, current);
  try {
    return deepEqual(previous, current);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    circularPaths.add(key);
    return circularDeepEqual(previous, current);
  }
}

export function sameEntry(
  previous: PathResolution,
  current: PathResolution,
  key: PathKey,
  circularPaths: Set<PathKey>,
): boolean {
  switch (previous.status) {
    case "found":
      return current.status === "found" &&
        sameValue(previous.value, current.value, key, circularPaths);
    case "missing":
      return current.status === "missing" &&
        pathToKey(previous.path) === pathToKey(current.path);
    case "blocked":
      return current.status === "blocked" &&
        pathToKey(previous.path) === pathToKey(current.path) &&
        sameValue(previous.value, current.value, key, circularPaths);
  }
}

