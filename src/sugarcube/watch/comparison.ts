import { circularDeepEqual, deepEqual } from "fast-equals";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import { pathToKey, type PathResolution } from "../variables/path";

export function sameValue(
  previous: unknown,
  current: unknown,
  key: string,
  circularPaths: Set<string>,
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
  key: string,
  circularPaths: Set<string>,
): boolean {
  if (previous.exists) {
    return current.exists && sameValue(previous.value, current.value, key, circularPaths);
  }
  if (current.exists) return false;
  if (pathToKey(previous.missingPath) !== pathToKey(current.missingPath) ||
      Boolean(previous.blockedExists) !== Boolean(current.blockedExists)) return false;
  return !previous.blockedExists || !current.blockedExists ||
    sameValue(previous.blocked, current.blocked, key, circularPaths);
}

