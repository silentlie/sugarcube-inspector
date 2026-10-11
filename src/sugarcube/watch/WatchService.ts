import type { SugarCubeSnapshot } from "../types";
import type { VariablePatch, WatchRequest, WatchResponse, VariablePath } from "./types";
import { collectionPaths, minimizeWatchPaths, structurePaths } from "./watchPaths";
import { circularDeepEqual, deepEqual } from "fast-equals";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import { collectionStructure, sameStructure, structureOf, type CollectionStructure } from "./structure";
import { isPathPrefix, pathToKey, resolvePath, type PathKey, type PathResolution } from "../variables/path";
import { SugarCubeService } from "../SugarCubeService";
import { SynchronizedVariableStore } from "../variables/SynchronizedVariableStore";

/** Coordinates watched comparisons and staged patches. */
export class WatchService {
  private readonly synchronized = new SynchronizedVariableStore();
  private previousCollections = new Map<PathKey, CollectionStructure>();
  private pendingCollections = new Map<PathKey, CollectionStructure>();
  private readonly circularPaths = new Set<PathKey>();

  constructor(private readonly sugarcube: SugarCubeService) {}

  /** Deep comparison remembers paths requiring circular-safe equality. */
  private sameValue(previous: unknown, current: unknown, key: PathKey): boolean {
    if (Object.is(previous, current)) return true;
    if (!isNonFunctionObject(previous) || !isNonFunctionObject(current)) return false;
    if (this.circularPaths.has(key)) return circularDeepEqual(previous, current);
    try {
      return deepEqual(previous, current);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.circularPaths.add(key);
      return circularDeepEqual(previous, current);
    }
  }

  private sameEntry(previous: PathResolution, current: PathResolution, key: PathKey): boolean {
    switch (previous.status) {
      case "found":
        return current.status === "found" && this.sameValue(previous.value, current.value, key);
      case "missing":
        return current.status === "missing" &&
          pathToKey(previous.path) === pathToKey(current.path);
      case "blocked":
        return current.status === "blocked" &&
          pathToKey(previous.path) === pathToKey(current.path) &&
          this.sameValue(previous.value, current.value, key);
    }
  }

  /** Compare live collection member identities once a collection has been observed. */
  private collectionChanged(
    path: VariablePath,
    synchronized: CollectionStructure | null,
    current: CollectionStructure | null,
    sameMember: (previous: unknown, current: unknown) => boolean,
  ): boolean {
    const key = pathToKey(path);
    if (current) this.pendingCollections.set(key, current);
    if (!synchronized || !current || synchronized.kind !== current.kind) return false;

    const tracked = this.previousCollections.get(key);
    const previousMembers = tracked?.kind === current.kind ? tracked.members : synchronized.members;
    const useLiveReferences = tracked?.kind === current.kind;
    return previousMembers.length !== current.members.length ||
      previousMembers.some((member, index) =>
        useLiveReferences
          ? !Object.is(member, current.members[index])
          : !sameMember(member, current.members[index]),
      );
  }

  capture(snapshot: SugarCubeSnapshot): number {
    const generation = this.synchronized.capture(snapshot);
    this.circularPaths.clear();
    this.previousCollections.clear();
    this.pendingCollections.clear();
    return generation;
  }

  /** Capture a full runtime snapshot and establish its watch generation. */
  captureSnapshot(): SugarCubeSnapshot {
    const snapshot = this.sugarcube.createSnapshot();
    return { ...snapshot, watchGeneration: this.capture(snapshot) };
  }

  poll(request: WatchRequest): WatchResponse {
    const generation = this.synchronized.generation;
    if (!this.synchronized.hasSnapshot || request.generation !== generation) {
      return { generation, changes: [] };
    }

    this.pendingCollections = new Map();

    // Collection entry indices are positional. Detect insertion/removal or
    // reordering first, before interpreting any descendant paths. Once MAIN
    // has observed a collection, compare its live entry identities; mutations
    // *inside* an existing Set member must not look like a new Set entry.
    const collections = collectionPaths([...request.favorites, ...request.visible]);
    const collectionKeys = new Set(collections.map(pathToKey));
    const collectionChanges: VariablePatch[] = [];
    const replacedCollections: VariablePath[] = [];

    for (const path of collections) {
      if (replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const key = pathToKey(path);
      const previous = this.synchronized.read(path);
      const current = this.sugarcube.resolveVariable(path);
      const oldStructure = previous.status === "found" ? collectionStructure(previous.value) : null;
      const newStructure = current.status === "found" ? collectionStructure(current.value) : null;

      const entriesChanged = this.collectionChanged(
        path, oldStructure, newStructure,
        (previous, current) => this.sameValue(previous, current, key),
      );
      if (!oldStructure && !newStructure) continue;

      // If the container itself changed type or became missing, restore the
      // nearest real ancestor instead of fabricating intermediate containers.
      if (!oldStructure || !newStructure || oldStructure.kind !== newStructure.kind) {
        const restorePath = (previous.status !== "found" ? previous.path
          : current.status !== "found" ? current.path : path) as VariablePath;
        const restored = this.sugarcube.resolveVariable(restorePath);
        collectionChanges.push(restored.status === "found"
          ? { op: "set", path: restorePath, value: structuredClone(restored.value) }
          : { op: "delete", path: restorePath });
        replacedCollections.push(restorePath);
        continue;
      }

      if (entriesChanged && current.status === "found") {
        collectionChanges.push({ op: "set", path, value: structuredClone(current.value) });
        replacedCollections.push(path);
      }
    }

    const structs = structurePaths(request.visible);
    const structuralChanges: VariablePatch[] = [];

    // Compare against the last synchronized state, including earlier patches.
    for (const path of structs) {
      const key = pathToKey(path);
      if (collectionKeys.has(key) ||
          replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const oldEntry = this.synchronized.read(path);
      const liveEntry = this.sugarcube.resolveVariable(path);
      const previous = structureOf(oldEntry.status === "found" ? oldEntry.value : undefined);
      const current = structureOf(liveEntry.status === "found" ? liveEntry.value : undefined);
      if (sameStructure(previous, current, (left, right) =>
        this.sameValue(left, right, key))) continue;
      const add = (value: unknown) => {
        structuralChanges.push({
          op: "set", path, value: structuredClone(value),
        });
      };
      if (!previous || !current || previous.kind !== current.kind) {
        if (liveEntry.status === "found") add(liveEntry.value);
        else structuralChanges.push({ op: "delete", path });
        continue;
      }
      if ("members" in previous || "members" in current) {
        if (liveEntry.status === "found") add(liveEntry.value);
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
          const added = this.sugarcube.resolveVariable(childPath);
          if (added.status !== "found") throw new Error("Added watch child disappeared during polling.");
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
    const valueChanges: VariablePatch[] = [];

    // Stage all patches before advancing the synchronized snapshot.
    for (const path of paths) {
      if (replacedCollections.some((ancestor) => isPathPrefix(ancestor, path))) continue;
      const key = pathToKey(path);
      const previous = this.synchronized.read(path);
      const current = this.sugarcube.resolveVariable(path);
      if (this.sameEntry(previous, current, key)) continue;

      if (current.status !== "found") {
        // A previously absent/blocked parent may now be present, even when
        // the leaf remains missing. Replace that parent to repair the tree.
        const restorePrevious = previous.status !== "found" &&
          previous.path.length < current.path.length;
        const patchPath = (restorePrevious ? previous.path : current.path) as VariablePath;
        const parent = this.sugarcube.resolveVariable(patchPath);
        const copy = parent.status === "found" ? structuredClone(parent.value) : undefined;
        valueChanges.push(parent.status === "found"
          ? { op: "set", path: patchPath, value: copy }
          : { op: "delete", path: patchPath });
        continue;
      }

      // If an ancestor was deleted, restore the whole ancestor, not just a
      // leaf that would leave an incomplete, invented object in the UI.
      const restorePath = (previous.status !== "found" && previous.path.length < path.length
        ? previous.path
        : path) as VariablePath;
      const restored = this.sugarcube.resolveVariable(restorePath);
      if (restored.status !== "found") throw new Error("Watch path disappeared during polling.");
      const cloned = structuredClone(restored.value);
      if (resolvePath(cloned, path.slice(restorePath.length)).status !== "found") {
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
    this.previousCollections = this.pendingCollections;
    this.pendingCollections = new Map();

    return {
      generation,
      changes,
    };
  }
}
