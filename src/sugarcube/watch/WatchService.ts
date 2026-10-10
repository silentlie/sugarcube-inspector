import type { SugarCubeSnapshot, SugarCubeVariables } from "../types";
import type { WatchPatch, WatchRequest, WatchResponse, VariablePath } from "./types";
import { collectionPaths, minimizeWatchPaths, structurePaths } from "./watchPaths";
import { sameEntry, sameValue } from "./comparison";
import { collectionMembers, structureOf } from "./structure";
import { isPathPrefix, pathToKey, resolvePath } from "../variables/path";
import { LiveVariableService } from "../variables/LiveVariableService";
import { SynchronizedVariableStore } from "../variables/SynchronizedVariableStore";

/** Coordinates watched comparisons and staged patches. */
export class WatchService {
  private readonly synchronized = new SynchronizedVariableStore();
  private readonly live = new LiveVariableService();
  private readonly circularPaths = new Set<string>();

  capture(snapshot: SugarCubeSnapshot): number {
    const generation = this.synchronized.capture(snapshot);
    this.circularPaths.clear();
    this.live.reset();
    return generation;
  }

  poll(request: WatchRequest, stores: SugarCubeVariables): WatchResponse {
    const generation = this.synchronized.generation;
    if (!this.synchronized.hasSnapshot || request.generation !== generation) {
      return { generation, changes: [] };
    }

    this.live.beginPoll();

    // Collection entry indices are positional. Detect insertion/removal or
    // reordering first, before interpreting any descendant paths. Once MAIN
    // has observed a collection, compare its live entry identities; mutations
    // *inside* an existing Set member must not look like a new Set entry.
    const collections = collectionPaths([...request.favorites, ...request.visible]);
    const collectionKeys = new Set(collections.map(pathToKey));
    const collectionChanges: WatchPatch[] = [];
    const replacedCollections: VariablePath[] = [];

    for (const path of collections) {
      if (replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const key = pathToKey(path);
      const previous = this.synchronized.read(path);
      const current = this.live.read(stores, path);
      const oldMembers = previous.exists ? collectionMembers(previous.value) : null;
      const newMembers = current.exists ? collectionMembers(current.value) : null;

      const entriesChanged = this.live.collectionChanged(
        path, oldMembers, newMembers,
        (previous, current) => sameValue(previous, current, key, this.circularPaths),
      );
      if (!oldMembers && !newMembers) continue;

      // If the container itself changed type or became missing, restore the
      // nearest real ancestor instead of fabricating intermediate containers.
      if (!oldMembers || !newMembers || oldMembers.kind !== newMembers.kind) {
        const restorePath = (!previous.exists ? previous.missingPath
          : !current.exists ? current.missingPath : path) as VariablePath;
        const restored = this.live.read(stores, restorePath);
        collectionChanges.push(restored.exists
          ? { op: "set", path: restorePath, value: structuredClone(restored.value) }
          : { op: "delete", path: restorePath });
        replacedCollections.push(restorePath);
        continue;
      }

      if (entriesChanged && current.exists) {
        collectionChanges.push({ op: "set", path, value: structuredClone(current.value) });
        replacedCollections.push(path);
      }
    }

    const structs = structurePaths(request.visible);
    const structuralChanges: WatchPatch[] = [];

    // Compare against the last synchronized state, including earlier patches.
    for (const path of structs) {
      const key = pathToKey(path);
      if (collectionKeys.has(key) ||
          replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const oldEntry = this.synchronized.read(path);
      const liveEntry = this.live.read(stores, path);
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
          const added = this.live.read(stores, childPath);
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
      if (replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const key = pathToKey(path);
      const previous = this.synchronized.read(path);
      const current = this.live.read(stores, path);
      if (sameEntry(previous, current, key, this.circularPaths)) continue;

      if (!current.exists) {
        // A previously absent/blocked parent may now be present, even when
        // the leaf remains missing. Replace that parent to repair the tree.
        const restorePrevious = !previous.exists &&
          previous.missingPath.length < current.missingPath.length;
        const patchPath = (restorePrevious ? previous.missingPath : current.missingPath) as VariablePath;
        const parent = this.live.read(stores, patchPath);
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
      const restored = this.live.read(stores, restorePath);
      if (!restored.exists) throw new Error("Watch path disappeared during polling.");
      const cloned = structuredClone(restored.value);
      if (!resolvePath(cloned, path.slice(restorePath.length)).exists) {
        throw new Error("Cloned watch path is missing.");
      }
      valueChanges.push({ op: "set", path: restorePath, value: cloned });
    }

    // A whole-parent patch supersedes descendant patches. Both lists can
    // legitimately observe the same path, so avoid applying overlapping edits.
    const staged = [...collectionChanges, ...structuralChanges, ...valueChanges];
    const changes = staged.filter((patch, index) =>
      !staged.some((other, otherIndex) =>
        index !== otherIndex && isPathPrefix(other.path, patch.path) &&
        (other.path.length < patch.path.length || otherIndex < index),
      ),
    );

    // Apply exactly the same patches sent to the inspector, in place.
    // Patch values were cloned before any mutation of the synchronized graph.
    this.synchronized.apply(changes);
    // Commit only after staging, cloning, and applying all patches succeeds.
    // Drop references for collections that are no longer being watched.
    this.live.commitPoll();

    return {
      generation,
      changes,
    };
  }
}
