import { useCallback, useMemo, useSyncExternalStore } from "react";
import { applyWatchPatches } from "../../sugarcube/applyWatchPatches";
import { isPathPrefix, pathToKey, readPathChild, resolvePath } from "../../sugarcube/path";
import type { SugarCubeVariables } from "../../sugarcube/types";
import type { PathSegment, VariablePath, WatchPatch } from "../../sugarcube/watch";

type Listener = () => void;
type Subscription = { path: VariablePath; listeners: Set<Listener> };

/** A mutable graph with versioned, path-local React subscriptions. */
export class VariableStore {
  readonly variables: SugarCubeVariables;
  private subscriptions = new Map<string, Subscription>();
  private versions = new Map<string, number>();
  private anyListeners = new Set<Listener>();
  private anyVersion = 0;

  constructor(variables: SugarCubeVariables) {
    this.variables = variables;
  }

  getValue(path: VariablePath): unknown {
    const result = resolvePath(this.variables, path);
    return result.exists ? result.value : undefined;
  }

  getVersion(key: string): number {
    return this.versions.get(key) ?? 0;
  }

  subscribe(path: VariablePath, listener: Listener): () => void {
    const key = pathToKey(path);
    let entry = this.subscriptions.get(key);
    if (!entry) {
      entry = { path, listeners: new Set() };
      this.subscriptions.set(key, entry);
    }
    entry.listeners.add(listener);
    return () => {
      entry!.listeners.delete(listener);
      if (!entry!.listeners.size) this.subscriptions.delete(key);
    };
  }

  subscribeAny = (listener: Listener): (() => void) => {
    this.anyListeners.add(listener);
    return () => { this.anyListeners.delete(listener); };
  };

  getAnyVersion = (): number => this.anyVersion;

  apply(patches: WatchPatch[]): void {
    if (!patches.length) return;
    const changed = new Set<string>();

    for (const patch of patches) {
      const parent: VariablePath = patch.path.length === 1
        ? patch.path
        : patch.path.slice(0, -1) as VariablePath;
      const parentValue = this.getValue(parent);
      const lastPart = patch.path.length > 1 ? patch.path.at(-1) as PathSegment : undefined;
      const hadKey = lastPart?.type === "property"
        && parentValue != null && typeof parentValue === "object"
        && Object.hasOwn(parentValue, lastPart.key);
      const arrayLengthChanged = lastPart?.type === "property" &&
        lastPart.key === "length" && Array.isArray(parentValue);
      const structureChanged = arrayLengthChanged || patch.path.length === 1 ||
        (lastPart && (lastPart.type === "mapKey" || lastPart.type === "mapValue" || lastPart.type === "setValue")) ||
        (patch.op === "delete" ? Boolean(hadKey) : !hadKey);

      // Collect impacted subscribers BEFORE mutating the graph, so aliases
      // can be identified by their existing object identity.
      for (const [key, { path: watched }] of this.subscriptions) {
        if (isPathPrefix(patch.path, watched) ||
            (structureChanged && isPathPrefix(watched, patch.path) &&
              watched.length === patch.path.length - 1)) {
          changed.add(key);
          continue;
        }

        // A shared object may also be visible under another path or scope.
        // Only traverse registered paths, never the whole SugarCube graph.
        let value: unknown = this.variables;
        for (let i = 0; i <= watched.length; i++) {
          // Whole-value replacement only changes the patched path. Notify
          // aliases when a nested patch actually mutates their shared parent.
          if (i > 1 && parent.length > 1 &&
              typeof parentValue === "object" && parentValue !== null &&
              value === parentValue) {
            changed.add(key);
            break;
          }
          if (i < watched.length) {
            const child = readPathChild(value, watched[i] as PathSegment);
            value = child.status === "found" ? child.value : undefined;
          }
        }
      }

      applyWatchPatches(this.variables, [patch]);
    }

    for (const key of changed) {
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      for (const listener of this.subscriptions.get(key)?.listeners ?? []) listener();
    }
    this.anyVersion++;
    for (const listener of this.anyListeners) listener();
  }
}

/** Subscribe to an individual node without depending on the root React state. */
export function useVariableVersion(store: VariableStore, path: VariablePath): number {
  const key = pathToKey(path);
  const stablePath = useMemo(() => path, [key]);
  const subscribe = useCallback(
    (listener: Listener) => store.subscribe(stablePath, listener),
    [store, stablePath],
  );
  const getVersion = useCallback(() => store.getVersion(key), [store, key]);
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useAnyVariableVersion(store: VariableStore): number {
  return useSyncExternalStore(
    store.subscribeAny,
    store.getAnyVersion,
    store.getAnyVersion,
  );
}
