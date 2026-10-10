import { circularDeepEqual, deepEqual } from "fast-equals";
import type { PathSegment, WatchPatch, WatchRequest, WatchResponse, WatchTarget, VisibleWatch } from "./watch";
import { minimizeWatchTargets, watchKey } from "./watch";
import { applyWatchPatches } from "./applyWatchPatches";
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

type Structure =
  | { kind: "object" | "array"; keys: string[]; length?: number }
  | { kind: "map" | "set"; keys: unknown[] };

function structureOf(value: unknown): Structure | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return { kind: "array", keys: Object.keys(value), length: value.length };
  }
  if (value instanceof Map) return { kind: "map", keys: [...value.keys()] };
  if (value instanceof Set) return { kind: "set", keys: [...value.values()] };
  if (value instanceof Date || value instanceof RegExp || value instanceof Error ||
      value instanceof ArrayBuffer || ArrayBuffer.isView(value) ||
      value instanceof WeakMap || value instanceof WeakSet) return null;
  return { kind: "object", keys: Object.keys(value) };
}

function segmentForKey(key: string, array: boolean): PathSegment {
  const index = Number(key);
  return array && Number.isInteger(index) && index >= 0 &&
    index < 2 ** 32 - 1 && String(index) === key
    ? { type: "index", index }
    : { type: "property", key };
}

function structureTargets(visible: readonly VisibleWatch[]): WatchTarget[] {
  const targets = new Map<string, WatchTarget>();
  for (const { target } of visible) {
    // Explicit root registrations are structure-only, including when empty.
    if (target.path.length === 0) {
      targets.set(watchKey(target), target);
      continue;
    }

    // Parent structures discover siblings. Do not inspect a collapsed
    // container's own children. Collection entries use unstable indices,
    // so check the containing Map/Set as a single structure.
    const normalized = minimizeWatchTargets([target])[0]!;
    const parent = normalized.path.length < target.path.length
      ? normalized
      : { scope: target.scope, path: target.path.slice(0, -1) };
    targets.set(watchKey(parent), parent);
  }
  return [...targets.values()];
}

function ancestorOrSelf(parent: WatchPatch, child: WatchPatch): boolean {
  return parent.scope === child.scope && parent.path.length <= child.path.length &&
    parent.path.every((part, i) => JSON.stringify(part) === JSON.stringify(child.path[i]));
}

/**
 * MAIN holds one mutable synchronized graph mirroring the inspector copy.
 * Watch registration affects polling, never the lifetime of this graph.
 */
export class WatchService {
  private synchronized: Stores | null = null;
  private generation = 0;
  private circularPaths = new Set<string>();

  capture(snapshot: SugarCubeSnapshot): number {
    this.synchronized = snapshot.variables;
    this.generation++;
    this.circularPaths.clear();
    return this.generation;
  }

  poll(request: WatchRequest, stores: Stores): WatchResponse {
    const started = performance.now();
    const baseline = this.synchronized;
    if (!baseline || request.generation !== this.generation) {
      return {
        generation: this.generation,
        changes: [],
        mainDurationMs: performance.now() - started,
      };
    }

    const structs = structureTargets(request.visible);
    const structuralChanges: WatchPatch[] = [];

    // Compare against the last synchronized state, including earlier patches.
    for (const target of structs) {
      const key = watchKey(target);
      const oldEntry = resolve(baseline, target);
      const liveEntry = resolve(stores, target);
      const previous = structureOf(oldEntry.exists ? oldEntry.value : undefined);
      const current = structureOf(liveEntry.exists ? liveEntry.value : undefined);
      if (!previous && !current) continue;
      const path = target.path;
      const add = (value: unknown) => {
        structuralChanges.push({
          op: "set", scope: target.scope, path, value: structuredClone(value),
        });
      };
      if (!previous || !current || previous.kind !== current.kind) {
        if (liveEntry.exists) add(liveEntry.value);
        else structuralChanges.push({ op: "delete", scope: target.scope, path });
        continue;
      }
      if (current.kind === "map" || current.kind === "set") {
        const oldKeys = previous.keys;
        const newKeys = current.keys;
        if (oldKeys.length !== newKeys.length ||
            oldKeys.some((old, i) => !sameValue(old, newKeys[i], key, this.circularPaths))) {
          add(liveEntry.value);
        }
        continue;
      }
      const before = new Set(previous.keys as string[]);
      const after = new Set(current.keys as string[]);
      const isArray = current.kind === "array";
      for (const childKey of before) {
        if (!after.has(childKey)) {
          structuralChanges.push({
            op: "delete", scope: target.scope,
            path: [...path, segmentForKey(childKey, isArray)],
          });
        }
      }
      for (const childKey of after) {
        if (!before.has(childKey)) {
          const childPath = [...path, segmentForKey(childKey, isArray)];
          const added = resolve(stores, { scope: target.scope, path: childPath });
          if (!added.exists) throw new Error("Added watch child disappeared during polling.");
          structuralChanges.push({
            op: "set", scope: target.scope, path: childPath,
            value: structuredClone(added.value),
          });
        }
      }
      if (current.kind === "array" && previous.kind === "array" &&
          previous.length !== current.length) {
        structuralChanges.push({
          op: "set", scope: target.scope,
          path: [...path, { type: "property", key: "length" }],
          value: current.length,
        });
      }
      // A future poll reads the resulting structure from synchronized state.
    }

    // Expanded visible containers are deep-watched as a whole, while
    // collapsed containers are not watched for their descendants. Visible
    // scalar/opaque leaves are checked normally. Favorite paths are independent.
    const valueVisible = request.visible.filter(({ target, expanded }) => {
      if (target.path.length === 0) return false;
      if (expanded) return true;
      const previous = resolve(baseline, target);
      const current = resolve(stores, target);
      return !structureOf(previous.value) || !structureOf(current.value);
    }).map(({ target }) => target);
    const targets = minimizeWatchTargets([...request.favorites, ...valueVisible]);
    const valueChanges: WatchPatch[] = [];

    // Stage all patches before advancing the synchronized snapshot.
    for (const target of targets) {
      const key = watchKey(target);
      const previous = resolve(baseline, target);
      const current = resolve(stores, target);
      if (sameEntry(previous, current, key, this.circularPaths)) continue;

      if (!current.exists) {
        // A previously absent/blocked parent may now be present, even when
        // the leaf remains missing. Replace that parent to repair the tree.
        const restorePrevious = !previous.exists && previous.missingPath &&
          previous.missingPath.length < (current.missingPath?.length ?? target.path.length);
        const patchPath = restorePrevious ? previous.missingPath! : current.missingPath ?? target.path;
        const parent = resolve(stores, { scope: target.scope, path: patchPath });
        const copy = parent.exists ? structuredClone(parent.value) : undefined;
        valueChanges.push(parent.exists
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
      if (!resolveValue(cloned, target.path.slice(restorePath.length)).exists) {
        throw new Error("Cloned watch path is missing.");
      }
      valueChanges.push({ op: "set", scope: target.scope, path: restorePath, value: cloned });
    }

    // A whole-parent patch supersedes descendant patches. Both lists can
    // legitimately observe the same path, so avoid applying overlapping edits.
    const staged = [...structuralChanges, ...valueChanges];
    const changes = staged.filter((patch, index) =>
      !staged.some((other, otherIndex) =>
        index !== otherIndex && ancestorOrSelf(other, patch) &&
        (other.path.length < patch.path.length || otherIndex < index),
      ),
    );

    // Apply exactly the same patches sent to the inspector, in place.
    // Patch values were cloned before any mutation of the synchronized graph.
    if (changes.length) applyWatchPatches(baseline, changes);

    return {
      generation: this.generation,
      changes,
      mainDurationMs: performance.now() - started,
    };
  }
}
