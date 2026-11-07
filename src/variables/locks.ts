import { isPrimitive } from "@sindresorhus/is";
import { sameFavoritePath } from "./favorites";
import { isEditablePrimitive, readLocation, resolvePropertyPath, type FavoritePath, type Primitive } from "./location";
import { variableWatcher } from "./watcher";

type VariableLock = { id: number; path: FavoritePath; value: Primitive };

let locks: readonly VariableLock[] = [];
let nextLockId = 0;
let stopPolling: (() => void) | undefined;
const listeners = new Set<() => void>();

function setLocks(next: readonly VariableLock[]) {
  locks = next;
  if (next.length === 0) {
    stopPolling?.();
    stopPolling = undefined;
  }
  for (const listener of listeners) listener();
}

function unlock(id: number) {
  const remaining = locks.filter((lock) => lock.id !== id);
  if (remaining.length !== locks.length) setLocks(remaining);
}

function enforceLocks() {
  const claimed = new WeakMap<object, Set<PropertyKey>>();
  const remaining = locks.filter(({ path, value }) => {
    try {
      const location = resolvePropertyPath(path);
      if (!location) return false;
      const current = readLocation(location);
      if (current.kind !== "value" || !current.editable || !isPrimitive(current.value)) return false;
      const { owner, key } = location;
      const keys = claimed.get(owner);
      if (keys?.has(key)) return false;
      if (!Object.is(current.value, value) && !Reflect.defineProperty(owner, key, { value })) return false;
      // If two paths converge on the same slot, the earlier lock wins.
      if (keys) keys.add(key);
      else claimed.set(owner, new Set([key]));
      return true;
    } catch {
      return false;
    }
  });
  if (remaining.length !== locks.length) setLocks(remaining);
}

export const variableLocks = {
  getSnapshot: () => locks,
  unlock,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  blocksEdit(owner: object, key: PropertyKey) {
    return locks.some(({ path }) => {
      const location = resolvePropertyPath(path);
      return location?.owner === owner && location.key === key;
    });
  },
  toggle(path: FavoritePath) {
    const existing = locks.find((lock) => sameFavoritePath(lock.path, path));
    if (existing) {
      unlock(existing.id);
      return;
    }

    try {
      const location = resolvePropertyPath(path);
      if (!location) return;
      const current = readLocation(location);
      if (current.kind !== "value" || !current.editable || !isEditablePrimitive(current.value)) return;
      stopPolling ??= variableWatcher.beforeRefresh(enforceLocks);
      setLocks([...locks, { id: nextLockId++, path, value: current.value }]);
    } catch {
      // An unreadable property cannot be locked.
    }
  },
  clear() {
    if (locks.length > 0) setLocks([]);
  },
};
