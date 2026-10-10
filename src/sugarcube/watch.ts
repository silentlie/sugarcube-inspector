import { isPathPrefix, normalizeCollectionPath, pathKey, resolvePath } from "./path";

export type VariableScope = "story" | "temporary";

/** JavaScript primitives (including null and undefined), not object-like values. */
export function isPrimitiveValue(value: unknown): boolean {
  return value === null ||
    (typeof value !== "object" && typeof value !== "function");
}

export type PathSegment =
  | { type: "property"; key: string }
  | { type: "mapKey"; index: number }
  | { type: "mapValue"; index: number }
  | { type: "setValue"; index: number };

/** The first property selects SugarCube's story or temporary variable store. */
export type VariablePath = [
  { type: "property"; key: VariableScope },
  ...PathSegment[],
];

export type WatchPatch =
  | { op: "set"; path: VariablePath; value: unknown }
  | { op: "delete"; path: VariablePath };

export interface WatchRequest {
  generation: number;
  favorites: VariablePath[];
  /** Includes the active-scope root for structure-only checking on every poll. */
  visible: VariablePath[];
}

export interface WatchResponse {
  generation: number;
  changes: WatchPatch[];
  /** Synchronous MAIN-world compare and clone time, excluding RPC latency. */
  mainDurationMs: number;
}

/**
 * Keep ancestors, discard their descendants.
 *
 * Map keys and Set values may be objects. JS exposes no object hash for
 * serializable paths, and object-key lookup requires the original reference.
 * Entries therefore use iteration indexes: removing a non-last entry shifts
 * later indexes, while new or reinserted entries append at the end.
 * To avoid stale entry paths, watch/copy the whole Map/Set on any change.
 */
export function minimizeWatchPaths(paths: VariablePath[]): VariablePath[] {
  const normalized = paths.map(normalizeCollectionPath);
  const unique = [...new Map(normalized.map((path) => [pathKey(path), path])).values()];
  return unique.filter(
    (path) => !unique.some((other) => other !== path && isPathPrefix(other, path)),
  );
}

/** Presence is independent of the value: an existing undefined is not missing. */
export function watchPathExists(
  stores: { story: unknown; temporary: unknown },
  path: VariablePath,
): boolean {
  return resolvePath(stores, path).exists;
}
