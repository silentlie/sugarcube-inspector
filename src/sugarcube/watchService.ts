import { circularDeepEqual, deepEqual } from "fast-equals";
import type { PathSegment, WatchPatch, WatchRequest, WatchResponse, WatchTarget } from "./watch";
import { minimizeWatchTargets, watchKey } from "./watch";
import type { SugarCubeSnapshot } from "./types";

interface Entry {
  exists: boolean;
  value?: unknown;
  /** The first missing segment, including its path. */
  missingPath?: PathSegment[];
  /** Existing parent that cannot be traversed (null, primitive, wrong collection). */
  blockedExists?: boolean;
  blocked?: unknown;
}

type Stores = SugarCubeSnapshot["variables"];

function child(value: unknown, segment: PathSegment): Entry {
  if (value == null) return { exists: false };
  if (segment.type === "property" || segment.type === "index") {
    const key = segment.type === "property" ? segment.key : segment.index;
    if (typeof value !== "object" || !Object.hasOwn(value, key)) return { exists: false };
    return { exists: true, value: (value as Record<string | number, unknown>)[key] };
  }
  if (segment.type === "mapKey" || segment.type === "mapValue") {
    if (!(value instanceof Map)) return { exists: false };
    const entry = Array.from(value.entries())[segment.index];
    return entry
      ? { exists: true, value: entry[segment.type === "mapKey" ? 0 : 1] }
      : { exists: false };
  }
  if (!(value instanceof Set)) return { exists: false };
  const values = Array.from(value);
  return segment.index >= 0 && segment.index < values.length
    ? { exists: true, value: values[segment.index] }
    : { exists: false };
}

function resolveValue(root: unknown, path: readonly PathSegment[]): Entry {
  let entry: Entry = { exists: true, value: root };
  for (let index = 0; index < path.length; index++) {
    const part = path[index]!;
    const parent = entry.value;
    const traversable = (part.type === "property" || part.type === "index")
      ? parent !== null && typeof parent === "object"
      : (part.type === "mapKey" || part.type === "mapValue")
        ? parent instanceof Map
        : parent instanceof Set;
    if (!traversable) {
      return {
        exists: false,
        missingPath: path.slice(0, index),
        blockedExists: true,
        blocked: parent,
      };
    }
    entry = child(parent, part);
    if (!entry.exists) return { exists: false, missingPath: path.slice(0, index + 1) };
  }
  return entry;
}

function resolve(stores: Stores, target: WatchTarget): Entry {
  return resolveValue(stores[target.scope], target.path);
}

/**
 * Use the fast non-circular comparator for ordinary state. Remember paths that
 * contain cycles so subsequent polls do not repeatedly exhaust the stack.
 */
function sameValue(
  previous: unknown,
  current: unknown,
  key: string,
  circularPaths: Set<string>,
): boolean {
  if (Object.is(previous, current)) return true;
  if (previous === null || current === null ||
      typeof previous !== "object" || typeof current !== "object") {
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

function sameEntry(
  previous: Entry,
  current: Entry,
  key: string,
  circularPaths: Set<string>,
): boolean {
  if (previous.exists !== current.exists) return false;
  if (!current.exists) {
    if (JSON.stringify(previous.missingPath) !== JSON.stringify(current.missingPath) ||
        Boolean(previous.blockedExists) !== Boolean(current.blockedExists)) return false;
    return !current.blockedExists ||
      sameValue(previous.blocked, current.blocked, key, circularPaths);
  }
  return sameValue(previous.value, current.value, key, circularPaths);
}

/**
 * MAIN-world watch state: a read-only full-snapshot baseline plus independent
 * overrides for watched paths changed since that snapshot.
 */
export class WatchService {
  private snapshot: SugarCubeSnapshot | null = null;
  private generation = 0;
  private watchCache = new Map<string, Entry>();
  private circularPaths = new Set<string>();

  capture(snapshot: SugarCubeSnapshot): number {
    this.snapshot = snapshot;
    this.generation++;
    this.watchCache.clear();
    this.circularPaths.clear();
    return this.generation;
  }

  poll(request: WatchRequest, stores: Stores): WatchResponse {
    const started = performance.now();
    if (!this.snapshot || request.generation !== this.generation) {
      return {
        generation: this.generation,
        changes: [],
        missingTargets: [],
        mainDurationMs: performance.now() - started,
      };
    }

    const targets = minimizeWatchTargets(request.targets);
    const active = new Set(targets.map(watchKey));
    const next = new Map<string, Entry>();
    const changes: WatchPatch[] = [];
    const missingTargets: WatchTarget[] = [];

    // Stage all changes first: a clone failure cannot partially advance the cache.
    for (const target of targets) {
      const key = watchKey(target);
      const previous = this.watchCache.get(key) ?? resolve(this.snapshot.variables, target);
      const current = resolve(stores, target);
      if (!current.exists) missingTargets.push(target);
      if (sameEntry(previous, current, key, this.circularPaths)) continue;

      if (!current.exists) {
        // A previously absent/blocked parent may now be present, even when
        // the leaf remains missing. Replace that parent to repair the tree.
        const restorePrevious = !previous.exists && previous.missingPath &&
          previous.missingPath.length < (current.missingPath?.length ?? target.path.length);
        const patchPath = restorePrevious ? previous.missingPath! : current.missingPath ?? target.path;
        const parent = resolve(stores, { scope: target.scope, path: patchPath });
        const copy = parent.exists ? structuredClone(parent.value) : undefined;
        next.set(key, {
          exists: false,
          missingPath: current.missingPath,
          blockedExists: current.blockedExists,
          blocked: current.blockedExists
            ? (restorePrevious || !parent.exists
                ? structuredClone(current.blocked)
                : copy)
            : undefined,
        });
        changes.push(parent.exists
          ? { op: "set", scope: target.scope, path: patchPath, value: copy }
          : { op: "delete", scope: target.scope, path: patchPath });
        continue;
      }

      // If an ancestor was deleted, restore the whole ancestor, not just a
      // leaf that would leave an incomplete, invented object in the UI.
      const restorePath = !previous.exists && previous.missingPath &&
        previous.missingPath.length < target.path.length
        ? previous.missingPath
        : target.path;
      const restored = resolve(stores, { scope: target.scope, path: restorePath });
      if (!restored.exists) throw new Error("Watch path disappeared during polling.");
      const cloned = structuredClone(restored.value);
      const watched = resolveValue(cloned, target.path.slice(restorePath.length));
      if (!watched.exists) throw new Error("Cloned watch path is missing.");

      next.set(key, { exists: true, value: watched.value });
      changes.push({ op: "set", scope: target.scope, path: restorePath, value: cloned });
    }

    for (const key of this.watchCache.keys()) {
      if (!active.has(key)) this.watchCache.delete(key);
    }
    for (const [key, entry] of next) this.watchCache.set(key, entry);
    for (const key of this.circularPaths) {
      if (!active.has(key)) this.circularPaths.delete(key);
    }

    return {
      generation: this.generation,
      changes,
      missingTargets,
      mainDurationMs: performance.now() - started,
    };
  }
}
