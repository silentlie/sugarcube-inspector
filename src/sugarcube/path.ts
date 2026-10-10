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

function canTraverse(value: unknown, part: PathSegment): boolean {
  if (part.type === "property" || part.type === "index") {
    return value !== null && typeof value === "object";
  }
  if (part.type === "mapKey" || part.type === "mapValue") return value instanceof Map;
  return value instanceof Set;
}

/** Read one path segment without confusing undefined with a missing entry. */
export function readPathChild(value: unknown, part: PathSegment): PathResult {
  if (!canTraverse(value, part)) return { exists: false };

  if (part.type === "property" || part.type === "index") {
    const key = part.type === "property" ? part.key : part.index;
    if (!Object.hasOwn(value, key)) return { exists: false };
    return {
      exists: true,
      value: (value as Record<string | number, unknown>)[key],
    };
  }

  if (part.type === "mapKey" || part.type === "mapValue") {
    const entry = [...(value as Map<unknown, unknown>).entries()][part.index];
    if (!entry) return { exists: false };
    return { exists: true, value: entry[part.type === "mapKey" ? 0 : 1] };
  }

  const values = [...(value as Set<unknown>).values()];
  if (part.index < 0 || part.index >= values.length) return { exists: false };
  return { exists: true, value: values[part.index] };
}

/**
 * Resolve a full or relative path. A blocked path identifies the existing
 * non-traversable parent so a watch can repair it when the parent changes.
 */
export function resolvePath(root: unknown, path: readonly PathSegment[]): PathResolution {
  let value = root;
  for (let index = 0; index < path.length; index++) {
    const part = path[index]!;
    if (!canTraverse(value, part)) {
      return {
        exists: false,
        missingPath: path.slice(0, index),
        blockedExists: true,
        blocked: value,
      };
    }
    const next = readPathChild(value, part);
    if (!next.exists) {
      return { exists: false, missingPath: path.slice(0, index + 1) };
    }
    value = next.value;
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
