import type { PathSegment, VariablePath } from "./watch";

/** Preserve existence separately from value: an existing undefined is not missing. */
export interface PathResult {
  exists: boolean;
  value?: unknown;
}

export interface PathResolution extends PathResult {
  /** First missing segment, or the existing ancestor that blocks traversal. */
  missingPath?: PathSegment[];
  blockedExists?: boolean;
  blocked?: unknown;
}

/** Reading a path child distinguishes type incompatibility from absence. */
export type ChildResult =
  | { status: "found"; value: unknown }
  | { status: "missing" }
  | { status: "blocked" };

/** Read one segment, preserving the distinction between missing and undefined. */
export function readPathChild(value: unknown, part: PathSegment): ChildResult {
  switch (part.type) {
    case "property":
    case "index": {
      if (value === null || typeof value !== "object") return { status: "blocked" };
      const key = part.type === "property" ? part.key : part.index;
      if (!Object.hasOwn(value, key)) return { status: "missing" };
      return {
        status: "found",
        value: (value as Record<string | number, unknown>)[key],
      };
    }
    case "mapKey":
    case "mapValue": {
      if (!(value instanceof Map)) return { status: "blocked" };
      const entry = [...value.entries()][part.index];
      if (!entry) return { status: "missing" };
      return { status: "found", value: entry[part.type === "mapKey" ? 0 : 1] };
    }
    case "setValue": {
      if (!(value instanceof Set)) return { status: "blocked" };
      const values = [...value.values()];
      if (part.index < 0 || part.index >= values.length) return { status: "missing" };
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
export function pathKey(path: readonly PathSegment[]): string {
  return JSON.stringify(path);
}

/** True if prefix is the same path or an ancestor of path. */
export function isPathPrefix(prefix: readonly PathSegment[], path: readonly PathSegment[]): boolean {
  return prefix.length <= path.length &&
    prefix.every((part, index) => JSON.stringify(part) === JSON.stringify(path[index]));
}

/**
 * Map/Set entry paths are positional, not stable keys. Watch their containing
 * collection instead of a potentially shifted entry.
 */
export function normalizeCollectionPath(path: VariablePath): VariablePath {
  const collectionIndex = path.findIndex(
    (part) => part.type === "mapKey" || part.type === "mapValue" ||
      part.type === "setValue",
  );
  return collectionIndex < 0 ? path : path.slice(0, collectionIndex) as VariablePath;
}

/** Use array-index segments only for canonical JavaScript array index keys. */
export function segmentForKey(key: string, isArray: boolean): PathSegment {
  const index = Number(key);
  return isArray && Number.isInteger(index) && index >= 0 &&
    index < 2 ** 32 - 1 && String(index) === key
    ? { type: "index", index }
    : { type: "property", key };
}
