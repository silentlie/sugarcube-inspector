import { isArray, isMap, isObject, isSet, isSymbol } from "@sindresorhus/is";
import type { VariableLocation } from "./variableLocation";

export type TreeChild = { id: string; name: string; location: VariableLocation };

type StructurePart =
  | { kind: "data"; key: PropertyKey; length?: number }
  | { kind: "accessor"; key: PropertyKey; getter: boolean; setter: boolean }
  | { kind: "map"; key: unknown }
  | { kind: "set"; key: unknown };
const childIds = new WeakMap<object, Map<unknown, string>>();
let nextChildId = 0;

function idForChild(owner: object, key: unknown): string {
  let ids = childIds.get(owner);
  if (!ids) {
    ids = new Map();
    childIds.set(owner, ids);
  }
  let id = ids.get(key);
  if (!id) {
    id = String(++nextChildId);
    ids.set(key, id);
  }
  return id;
}

/** Only expanded containers need a structural watcher. */
export function readStructure(value: unknown): readonly StructurePart[] {
  if (!isObject(value)) return [];
  const parts: StructurePart[] = [];
  if (isMap(value)) {
    for (const key of Map.prototype.keys.call(value) as MapIterator<unknown>) {
      parts.push({ kind: "map", key });
    }
  } else if (isSet(value)) {
    for (const member of Set.prototype.values.call(value) as SetIterator<unknown>) {
      parts.push({ kind: "set", key: member });
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if ("value" in descriptor) {
      parts.push({
        kind: "data",
        key,
        ...(isArray(value) && key === "length" &&
          { length: descriptor.value as number }),
      });
    } else {
      parts.push({
        kind: "accessor",
        key,
        getter: Boolean(descriptor.get),
        setter: Boolean(descriptor.set),
      });
    }
  }
  return parts;
}

export function sameStructure(a: readonly StructurePart[], b: readonly StructurePart[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((part, i) => {
    const other = b[i];
    if (!other || part.kind !== other.kind || !Object.is(part.key, other.key)) return false;

    switch (part.kind) {
      case "data":
        return other.kind === "data" && Object.is(part.length, other.length);
      case "accessor":
        return other.kind === "accessor" &&
          part.getter === other.getter && part.setter === other.setter;
      case "map":
      case "set":
        return true;
    }
  });
}

/** Child locations retain the actual owner, Map key, or Set member. */
export function listChildren(value: unknown): TreeChild[] {
  if (!isObject(value)) return [];
  const children: TreeChild[] = [];
  if (isMap(value)) {
    let i = 0;
    for (const key of Map.prototype.keys.call(value) as MapIterator<unknown>) {
      children.push({
        id: `map-key-${idForChild(value, key)}`, name: `[${i}] key`,
        location: { kind: "map-key", owner: value, key },
      }, {
        id: `map-value-${idForChild(value, key)}`, name: `[${i}] value`,
        location: { kind: "map-value", owner: value, key },
      });
      i++;
    }
  } else if (isSet(value)) {
    let i = 0;
    for (const member of Set.prototype.values.call(value) as SetIterator<unknown>) {
      children.push({
        id: `set-${idForChild(value, member)}`, name: `[${i}]`,
        location: { kind: "set-value", owner: value, member },
      });
      i++;
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    children.push({
      id: `property-${idForChild(value, key)}`,
      name: isSymbol(key) ? String(key) : key,
      location: { kind: "property", owner: value, key },
    });
  }
  return children;
}

