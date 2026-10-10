import { circularDeepEqual, deepEqual } from "fast-equals";
import type { WatchPatch, WatchRequest, WatchResponse, VariablePath } from "./watch";
import { minimizeWatchPaths } from "./watch";
import { isPathPrefix, pathKey } from "./path";
import { applyWatchPatches } from "./applyWatchPatches";
import { resolvePath, type PathResolution } from "./path";
import type { SugarCubeSnapshot } from "./types";

type Entry = PathResolution;
type Stores = SugarCubeSnapshot["variables"];

function resolve(stores: Stores, path: VariablePath): Entry {
  return resolvePath(stores, path);
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
  if (previous.exists) {
    return current.exists && sameValue(previous.value, current.value, key, circularPaths);
  }
  if (current.exists) return false;
  if (JSON.stringify(previous.missingPath) !== JSON.stringify(current.missingPath) ||
      Boolean(previous.blockedExists) !== Boolean(current.blockedExists)) return false;
  return !previous.blockedExists || !current.blockedExists ||
    sameValue(previous.blocked, current.blocked, key, circularPaths);
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

function structurePaths(visible: readonly VariablePath[]): VariablePath[] {
  const paths = new Map<string, VariablePath>();
  for (const path of visible) {
    // Explicit root registrations are structure-only, including when empty.
    if (path.length === 1) {
      paths.set(pathKey(path), path);
      continue;
    }

    // Parent structures discover siblings. Do not inspect a collapsed
    // container's own children. Collection entries use unstable indices,
    // so check the containing Map/Set as a single structure.
    const normalized = minimizeWatchPaths([path])[0]!;
    const parent = normalized.length < path.length
      ? normalized
      : path.slice(0, -1) as VariablePath;
    paths.set(pathKey(parent), parent);
  }
  return [...paths.values()];
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

    const structs = structurePaths(request.visible);
    const structuralChanges: WatchPatch[] = [];

    // Compare against the last synchronized state, including earlier patches.
    for (const path of structs) {
      const key = pathKey(path);
      const oldEntry = resolve(baseline, path);
      const liveEntry = resolve(stores, path);
      const previous = structureOf(oldEntry.exists ? oldEntry.value : undefined);
      const current = structureOf(liveEntry.exists ? liveEntry.value : undefined);
      if (!previous && !current) continue;
      const add = (value: unknown) => {
        structuralChanges.push({
          op: "set", path, value: structuredClone(value),
        });
      };
      if (!previous || !current || previous.kind !== current.kind) {
        if (liveEntry.exists) add(liveEntry.value);
        else structuralChanges.push({ op: "delete", path });
        continue;
      }
      if (current.kind === "map" || current.kind === "set") {
        const oldKeys = previous.keys;
        const newKeys = current.keys;
        if (liveEntry.exists && (oldKeys.length !== newKeys.length ||
            oldKeys.some((old, i) => !sameValue(old, newKeys[i], key, this.circularPaths)))) {
          add(liveEntry.value);
        }
        continue;
      }
      const before = new Set(previous.keys as string[]);
      const after = new Set(current.keys as string[]);
      for (const childKey of before) {
        if (!after.has(childKey)) {
          structuralChanges.push({
            op: "delete", path: [...path, { type: "property", key: childKey }] as VariablePath,
          });
        }
      }
      for (const childKey of after) {
        if (!before.has(childKey)) {
          const childPath: VariablePath = [...path, { type: "property", key: childKey }];
          const added = resolve(stores, childPath);
          if (!added.exists) throw new Error("Added watch child disappeared during polling.");
          structuralChanges.push({
            op: "set", path: childPath,
            value: structuredClone(added.value),
          });
        }
      }
      if (current.kind === "array" && previous.kind === "array" &&
          previous.length !== current.length) {
        structuralChanges.push({
          op: "set", path: [...path, { type: "property", key: "length" }] as VariablePath,
          value: current.length,
        });
      }
      // A future poll reads the resulting structure from synchronized state.
    }

    // Only eligible visible leaves and expanded containers are registered.
    // The scope root is structure-only, never a whole-value watch.
    const valueVisible = request.visible.filter((path) => path.length > 1);
    const paths = minimizeWatchPaths([...request.favorites, ...valueVisible]);
    const valueChanges: WatchPatch[] = [];

    // Stage all patches before advancing the synchronized snapshot.
    for (const path of paths) {
      const key = pathKey(path);
      const previous = resolve(baseline, path);
      const current = resolve(stores, path);
      if (sameEntry(previous, current, key, this.circularPaths)) continue;

      if (!current.exists) {
        // A previously absent/blocked parent may now be present, even when
        // the leaf remains missing. Replace that parent to repair the tree.
        const restorePrevious = !previous.exists &&
          previous.missingPath.length < current.missingPath.length;
        const patchPath = (restorePrevious ? previous.missingPath : current.missingPath) as VariablePath;
        const parent = resolve(stores, patchPath);
        const copy = parent.exists ? structuredClone(parent.value) : undefined;
        valueChanges.push(parent.exists
          ? { op: "set", path: patchPath, value: copy }
          : { op: "delete", path: patchPath });
        continue;
      }

      // If an ancestor was deleted, restore the whole ancestor, not just a
      // leaf that would leave an incomplete, invented object in the UI.
      const restorePath = (!previous.exists && previous.missingPath.length < path.length
        ? previous.missingPath
        : path) as VariablePath;
      const restored = resolve(stores, restorePath);
      if (!restored.exists) throw new Error("Watch path disappeared during polling.");
      const cloned = structuredClone(restored.value);
      if (!resolvePath(cloned, path.slice(restorePath.length)).exists) {
        throw new Error("Cloned watch path is missing.");
      }
      valueChanges.push({ op: "set", path: restorePath, value: cloned });
    }

    // A whole-parent patch supersedes descendant patches. Both lists can
    // legitimately observe the same path, so avoid applying overlapping edits.
    const staged = [...structuralChanges, ...valueChanges];
    const changes = staged.filter((patch, index) =>
      !staged.some((other, otherIndex) =>
        index !== otherIndex && isPathPrefix(other.path, patch.path) &&
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
