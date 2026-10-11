import { isReference } from "./direct";
import type { VariableSlot } from "./variableSlots";

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

