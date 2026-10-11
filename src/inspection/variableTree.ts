import { getStore, isReference, preview, type Scope } from "./direct";

export type VariableSlot =
  | { kind: "root"; scope: Scope }
  | { kind: "property"; owner: object; key: PropertyKey }
  | { kind: "map-key"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "map-value"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "set-value"; owner: Set<unknown>; member: unknown };

export type SlotSnapshot = {
  exists: boolean;
  value: unknown;
  preview: string;
  expandable: boolean;
  writableNumber: boolean;
  hidden: boolean;
  accessor?: "getter" | "setter" | "getter/setter";
  error?: string;
};

export type TreeChild = { id: string; name: string; slot: VariableSlot };

type StructurePart = { key: unknown; descriptor: string; length?: number };
export type StructureSnapshot = { parts: readonly StructurePart[]; error?: string };

const propertyIds = new WeakMap<object, Map<PropertyKey, string>>();
let nextPropertyId = 0;

function idForProperty(owner: object, key: PropertyKey): string {
  let ids = propertyIds.get(owner);
  if (!ids) {
    ids = new Map();
    propertyIds.set(owner, ids);
  }
  let id = ids.get(key);
  if (!id) {
    id = `property-${++nextPropertyId}`;
    ids.set(key, id);
  }
  return id;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function snapshot(
  value: unknown,
  exists: boolean,
  writable: boolean,
  hidden = false,
  accessor?: SlotSnapshot["accessor"],
): SlotSnapshot {
  return {
    exists,
    value,
    preview: !exists ? "[Missing]" : accessor ? `[${accessor}]` : preview(value),
    expandable: exists && !accessor && isReference(value),
    writableNumber: writable && typeof value === "number" && Number.isFinite(value),
    hidden,
    ...(accessor && { accessor }),
  };
}

/** Read the current slot directly, without triggering an ordinary property getter. */
export function readSlot(slot: VariableSlot): SlotSnapshot {
  try {
    switch (slot.kind) {
      case "root": {
        const value = getStore(slot.scope);
        return snapshot(value, value !== undefined, false);
      }
      case "property": {
        const descriptor = Object.getOwnPropertyDescriptor(slot.owner, slot.key);
        if (!descriptor) return snapshot(undefined, false, false);
        if (!("value" in descriptor)) {
          const accessor = descriptor.get && descriptor.set ? "getter/setter"
            : descriptor.get ? "getter" : "setter";
          return snapshot(undefined, true, false, !descriptor.enumerable, accessor);
        }
        return snapshot(
          descriptor.value, true, descriptor.writable === true, !descriptor.enumerable,
        );
      }
      case "map-key": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        return snapshot(slot.key, exists, false);
      }
      case "map-value": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        const value = exists ? Map.prototype.get.call(slot.owner, slot.key) : undefined;
        return snapshot(value, exists, exists);
      }
      case "set-value":
        return snapshot(slot.member, Set.prototype.has.call(slot.owner, slot.member), false);
    }
  } catch (cause) {
    return { ...snapshot(undefined, false, false), error: errorMessage(cause) };
  }
}

export function sameSlot(a: SlotSnapshot, b: SlotSnapshot): boolean {
  return a.exists === b.exists && Object.is(a.value, b.value) &&
    a.preview === b.preview && a.expandable === b.expandable &&
    a.writableNumber === b.writableNumber && a.hidden === b.hidden &&
    a.accessor === b.accessor && a.error === b.error;
}

/** Only expanded containers need a structural watcher. */
export function readStructure(value: unknown): StructureSnapshot {
  if (!isReference(value)) return { parts: [] };
  try {
    const parts: StructurePart[] = [];
    if (value instanceof Map) {
      for (const key of Map.prototype.keys.call(value) as MapIterator<unknown>) {
        parts.push({ key, descriptor: "map" });
      }
    } else if (value instanceof Set) {
      for (const member of Set.prototype.values.call(value) as SetIterator<unknown>) {
        parts.push({ key: member, descriptor: "set" });
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      const isData = "value" in descriptor;
      parts.push({
        key,
        descriptor: isData
          ? `property:data:${descriptor.enumerable}:${descriptor.writable}`
          : `property:accessor:${descriptor.enumerable}:${Boolean(descriptor.get)}:${Boolean(descriptor.set)}`,
        ...(Array.isArray(value) && key === "length" && isData &&
          { length: descriptor.value as number }),
      });
    }
    return { parts };
  } catch (cause) {
    return { parts: [], error: errorMessage(cause) };
  }
}

export function sameStructure(a: StructureSnapshot, b: StructureSnapshot): boolean {
  if (a.error !== b.error || a.parts.length !== b.parts.length) return false;
  return a.parts.every((part, i) => {
    const other = b.parts[i];
    return other !== undefined && Object.is(part.key, other.key) &&
      part.descriptor === other.descriptor && Object.is(part.length, other.length);
  });
}

/** Child locations retain the actual owner, Map key, or Set member. */
export function listChildren(value: unknown): TreeChild[] {
  if (!isReference(value)) return [];
  const children: TreeChild[] = [];
  if (value instanceof Map) {
    let i = 0;
    for (const key of Map.prototype.keys.call(value) as MapIterator<unknown>) {
      children.push({
        id: `map-${i}-key`, name: `[${i}] key`,
        slot: { kind: "map-key", owner: value, key },
      }, {
        id: `map-${i}-value`, name: `[${i}] value`,
        slot: { kind: "map-value", owner: value, key },
      });
      i++;
    }
  } else if (value instanceof Set) {
    let i = 0;
    for (const member of Set.prototype.values.call(value) as SetIterator<unknown>) {
      children.push({
        id: `set-${i}`, name: `[${i}]`,
        slot: { kind: "set-value", owner: value, member },
      });
      i++;
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    children.push({
      id: idForProperty(value, key),
      name: typeof key === "symbol" ? String(key) : key,
      slot: { kind: "property", owner: value, key },
    });
  }
  return children;
}

export function incrementSlot(slot: VariableSlot): void {
  const current = readSlot(slot);
  if (!current.writableNumber || typeof current.value !== "number") {
    throw new Error("This property cannot be incremented.");
  }
  if (slot.kind === "property") {
    if (!Reflect.set(slot.owner, slot.key, current.value + 1)) {
      throw new Error("The game rejected the write.");
    }
  } else if (slot.kind === "map-value") {
    Map.prototype.set.call(slot.owner, slot.key, current.value + 1);
  } else {
    throw new Error("This property cannot be incremented.");
  }
}

export interface VariableSubscription<T> {
  getSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
}

type ActiveWatch = { check: () => void };

/** Shared scheduler: one interval for all mounted variable and structure subscriptions. */
export class VariableWatcher {
  private readonly active = new Set<ActiveWatch>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly intervalMs = 250) {}

  watch<T>(read: () => T, equal: (a: T, b: T) => boolean): VariableSubscription<T> {
    let current = read();
    const listeners = new Set<() => void>();
    const observer: ActiveWatch = {
      check: () => {
        const next = read();
        if (equal(current, next)) return;
        current = next;
        for (const listener of [...listeners]) listener();
      },
    };

    return {
      getSnapshot: () => current,
      subscribe: (callback) => {
        listeners.add(callback);
        if (listeners.size === 1) this.start(observer);
        observer.check(); // Catch mutations between React render and subscription.
        return () => {
          listeners.delete(callback);
          if (listeners.size === 0) this.stop(observer);
        };
      },
    };
  }

  refresh(): void {
    for (const watcher of [...this.active]) watcher.check();
  }

  private start(observer: ActiveWatch): void {
    this.active.add(observer);
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.refresh(), this.intervalMs);
    }
  }

  private stop(observer: ActiveWatch): void {
    this.active.delete(observer);
    if (this.active.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export const variableWatcher = new VariableWatcher();
