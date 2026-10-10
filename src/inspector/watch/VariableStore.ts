import { useCallback, useMemo, useSyncExternalStore } from "react";
import { applyWatchPatches } from "../../sugarcube/applyWatchPatches";
import { isPathPrefix, readPathChild, resolvePath } from "../../sugarcube/path";
import type { SugarCubeSnapshot } from "../../sugarcube/types";
import { watchKey, type PathSegment, type VariablePath, type WatchPatch, type WatchTarget } from "../../sugarcube/watch";

type Variables = SugarCubeSnapshot["variables"];
type Listener = () => void;
type Subscription = { target: WatchTarget; listeners: Set<Listener> };

/** A mutable graph with versioned, path-local React subscriptions. */
export class VariableStore {
  readonly variables: Variables;
  private subscriptions = new Map<string, Subscription>();
  private versions = new Map<string, number>();
  private anyListeners = new Set<Listener>();
  private anyVersion = 0;

  constructor(variables: Variables) {
    this.variables = variables;
  }

  getValue(target: WatchTarget): unknown {
    return resolvePath(this.variables, target.path).value;
  }

  getVersion(key: string): number {
    return this.versions.get(key) ?? 0;
  }

  subscribe(target: WatchTarget, listener: Listener): () => void {
    const key = watchKey(target);
    let entry = this.subscriptions.get(key);
    if (!entry) {
      entry = { target, listeners: new Set() };
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
      const parent: WatchTarget = {
        path: patch.path.length === 1 ? patch.path : patch.path.slice(0, -1) as VariablePath,
      };
      const parentValue = this.getValue(parent);
      const lastPart = patch.path.length > 1 ? patch.path.at(-1) as PathSegment : undefined;
      const hadKey = lastPart && (lastPart.type === "property" || lastPart.type === "index")
        && parentValue != null && typeof parentValue === "object"
        && Object.hasOwn(parentValue, lastPart.type === "property" ? lastPart.key : lastPart.index);
      const arrayLengthChanged = lastPart?.type === "property" &&
        lastPart.key === "length" && Array.isArray(parentValue);
      const structureChanged = arrayLengthChanged || patch.path.length === 1 ||
        (lastPart && (lastPart.type === "mapKey" || lastPart.type === "mapValue" || lastPart.type === "setValue")) ||
        (patch.op === "delete" ? Boolean(hadKey) : !hadKey);

      // Collect impacted subscribers BEFORE mutating the graph, so aliases
      // can be identified by their existing object identity.
      for (const [key, { target: watched }] of this.subscriptions) {
        if (isPathPrefix(patch.path, watched.path) ||
            (structureChanged && isPathPrefix(watched.path, patch.path) &&
              watched.path.length === patch.path.length - 1)) {
          changed.add(key);
          continue;
        }

        // A shared object may also be visible under another path or scope.
        // Only traverse registered paths, never the whole SugarCube graph.
        let value: unknown = this.variables;
        for (let i = 0; i <= watched.path.length; i++) {
          // Whole-value replacement only changes the patched path. Notify
          // aliases when a nested patch actually mutates their shared parent.
          if (i > 1 && parent.path.length > 1 &&
              typeof parentValue === "object" && parentValue !== null &&
              value === parentValue) {
            changed.add(key);
            break;
          }
          if (i < watched.path.length) value = readPathChild(value, watched.path[i] as PathSegment).value;
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
export function useVariableVersion(store: VariableStore, target: WatchTarget): number {
  const key = watchKey(target);
  const stableTarget = useMemo(() => target, [key]);
  const subscribe = useCallback(
    (listener: Listener) => store.subscribe(stableTarget, listener),
    [store, stableTarget],
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
