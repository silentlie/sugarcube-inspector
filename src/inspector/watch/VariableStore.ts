import { useCallback, useMemo, useSyncExternalStore } from "react";
import { applyWatchPatches } from "../../sugarcube/applyWatchPatches";
import type { SugarCubeSnapshot } from "../../sugarcube/types";
import { isPrimitiveValue, watchKey, type PathSegment, type WatchPatch, type WatchTarget } from "../../sugarcube/watch";

type Variables = SugarCubeSnapshot["variables"];
type Listener = () => void;
type Subscription = { target: WatchTarget; listeners: Set<Listener> };

function child(value: unknown, segment: PathSegment): unknown {
  if (value == null) return undefined;
  if (segment.type === "property" || segment.type === "index") {
    const key = segment.type === "property" ? segment.key : segment.index;
    return typeof value === "object" && Object.hasOwn(value, key)
      ? (value as Record<string | number, unknown>)[key] : undefined;
  }
  if (segment.type === "mapKey" || segment.type === "mapValue") {
    if (!(value instanceof Map)) return undefined;
    const entry = [...value.entries()][segment.index];
    return entry?.[segment.type === "mapKey" ? 0 : 1];
  }
  return value instanceof Set ? [...value][segment.index] : undefined;
}

function resolve(variables: Variables, target: WatchTarget): unknown {
  return target.path.reduce<unknown>((value, part) => child(value, part), variables[target.scope]);
}

function isPrefix(prefix: readonly PathSegment[], path: readonly PathSegment[]): boolean {
  return prefix.length <= path.length && prefix.every((part, i) =>
    JSON.stringify(part) === JSON.stringify(path[i]));
}

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
    return resolve(this.variables, target);
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
      const parent: WatchTarget = { scope: patch.scope, path: patch.path.slice(0, -1) };
      const parentValue = this.getValue(parent);
      const lastPart = patch.path.at(-1);
      const hadKey = lastPart && (lastPart.type === "property" || lastPart.type === "index")
        && parentValue != null && typeof parentValue === "object"
        && Object.hasOwn(parentValue, lastPart.type === "property" ? lastPart.key : lastPart.index);
      const arrayLengthChanged = lastPart?.type === "property" &&
        lastPart.key === "length" && Array.isArray(parentValue);
      // Keep the root's "no immediate primitives" watch decision current
      // when a top-level property's kind changes without changing its key.
      const primitiveKindChanged = patch.path.length === 1 &&
        patch.op === "set" && Boolean(hadKey) &&
        (lastPart?.type === "property" || lastPart?.type === "index") &&
        isPrimitiveValue((parentValue as Record<string | number, unknown>)[
          lastPart.type === "property" ? lastPart.key : lastPart.index
        ]) !== isPrimitiveValue(patch.value);
      const structureChanged = arrayLengthChanged || patch.path.length === 0 ||
        (lastPart && (lastPart.type === "mapKey" || lastPart.type === "mapValue" || lastPart.type === "setValue")) ||
        (patch.op === "delete" ? Boolean(hadKey) : !hadKey);

      // Collect impacted subscribers BEFORE mutating the graph, so aliases
      // can be identified by their existing object identity.
      for (const [key, { target: watched }] of this.subscriptions) {
        if (watched.scope === patch.scope) {
          if (isPrefix(patch.path, watched.path) ||
              ((structureChanged || primitiveKindChanged) && isPrefix(watched.path, patch.path) &&
                watched.path.length === patch.path.length - 1)) {
            changed.add(key);
            continue;
          }
        }

        // A shared object may also be visible under another path or scope.
        // Only traverse registered paths, never the whole SugarCube graph.
        let value: unknown = this.variables[watched.scope];
        for (let i = 0; i <= watched.path.length; i++) {
          // Whole-value replacement only changes the patched path. Notify
          // aliases when a nested patch actually mutates their shared parent.
          if (i > 0 && parent.path.length > 0 &&
              typeof parentValue === "object" && parentValue !== null &&
              value === parentValue) {
            changed.add(key);
            break;
          }
          if (i < watched.path.length) value = child(value, watched.path[i]!);
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
