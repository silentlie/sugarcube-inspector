import { isArray, isMap, isObject, isSet } from "@sindresorhus/is";
import type { ChildLocation } from "./location";

type StructurePart =
  | { kind: "data"; key: PropertyKey; length?: number }
  | { kind: "accessor"; key: PropertyKey; getter: boolean; setter: boolean }
  | { kind: "map"; key: unknown }
  | { kind: "set"; key: unknown };

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

/** Enumerate direct live locations; a Map entry appears once, a Set member once. */
export function listChildren(value: unknown): ChildLocation[] {
  if (!isObject(value)) return [];
  const children: ChildLocation[] = [];
  if (isMap(value)) {
    for (const key of Map.prototype.keys.call(value) as MapIterator<unknown>) {
      children.push({ kind: "map", owner: value, key });
    }
  } else if (isSet(value)) {
    for (const member of Set.prototype.values.call(value) as SetIterator<unknown>) {
      children.push({ kind: "set", owner: value, member });
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    children.push({ kind: "property", owner: value, key });
  }
  return children;
}
