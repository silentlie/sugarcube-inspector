import { isMap, isSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import type { PathSegment } from "../watch/types";

/** Existing undefined values are found; missing and blocked paths are distinct. */
export type PathResolution =
  | { exists: true; value: unknown }
  | { exists: false; missingPath: PathSegment[]; blockedExists?: false }
  | { exists: false; missingPath: PathSegment[]; blockedExists: true; blocked: unknown };

/** Reading a path child distinguishes type incompatibility from absence. */
export type ChildResult =
  | { status: "found"; value: unknown }
  | { status: "missing" }
  | { status: "blocked" };

/** Read one segment, preserving the distinction between missing and undefined. */
export function readPathChild(value: unknown, part: PathSegment): ChildResult {
  switch (part.type) {
    case "property": {
      if (!isNonFunctionObject(value)) return { status: "blocked" };
      if (!Object.hasOwn(value, part.key)) return { status: "missing" };
      return { status: "found", value: Reflect.get(value, part.key) };
    }
    case "mapKey":
    case "mapValue": {
      if (!isMap(value)) return { status: "blocked" };
      const entries = [...value.entries()];
      if (!(part.index in entries)) return { status: "missing" };
      const entry = entries[part.index]!;
      return { status: "found", value: entry[part.type === "mapKey" ? 0 : 1] };
    }
    case "setValue": {
      if (!isSet(value)) return { status: "blocked" };
      const values = [...value.values()];
      if (!(part.index in values)) return { status: "missing" };
      return { status: "found", value: values[part.index] };
    }
  }
}

/**
 * Resolve a full or relative path. A blocked path identifies the existing
 * non-traversable parent so a watch can repair it when the parent changes.
 */
export function resolvePath(root: unknown, path: readonly PathSegment[]): PathResolution {
  let value = root;
  for (let index = 0; index < path.length; index++) {
    const part = path[index]!;
    const next = readPathChild(value, part);
    switch (next.status) {
      case "found":
        value = next.value;
        break;
      case "missing":
        return { exists: false, missingPath: path.slice(0, index + 1) };
      case "blocked":
        return {
          exists: false,
          missingPath: path.slice(0, index),
          blockedExists: true,
          blocked: value,
        };
    }
  }
  return { exists: true, value };
}

/** A stable, serializable key for the tagged path segments. */
export function pathToKey(path: readonly PathSegment[]): string {
  return JSON.stringify(path);
}

/** Compare only the fields that identify each tagged path segment. */
function samePathSegment(left: PathSegment, right: PathSegment): boolean {
  if (left.type === "property") {
    return right.type === "property" && left.key === right.key;
  }
  return left.type === right.type && left.index === right.index;
}

/** True if prefix is the same path or an ancestor of path. */
export function isPathPrefix(prefix: readonly PathSegment[], path: readonly PathSegment[]): boolean {
  return prefix.length <= path.length &&
    prefix.every((part, index) => samePathSegment(part, path[index]!));
}

