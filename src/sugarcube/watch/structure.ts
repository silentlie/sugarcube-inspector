import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet, isWeakMap, isWeakSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";

/** Map keys and Set values identify positional collection entries. */
export type CollectionStructure = {
  kind: "map" | "set";
  members: unknown[];
};

type Structure =
  | { kind: "object"; keys: string[] }
  | { kind: "array"; keys: string[]; length: number }
  | CollectionStructure;

/** Extract the ordered members used to identify Map/Set entries. */
export function collectionStructure(value: unknown): CollectionStructure | null {
  if (isMap(value)) return { kind: "map", members: [...value.keys()] };
  if (isSet(value)) return { kind: "set", members: [...value.values()] };
  return null;
}

export function structureOf(value: unknown): Structure | null {
  if (!isNonFunctionObject(value)) return null;
  if (isArray(value)) {
    return { kind: "array", keys: Object.keys(value), length: value.length };
  }
  const collection = collectionStructure(value);
  if (collection) return collection;
  if (isDate(value) || isRegExp(value) || isError(value) ||
      isArrayBuffer(value) || ArrayBuffer.isView(value) ||
      isWeakMap(value) || isWeakSet(value)) return null;
  return { kind: "object", keys: Object.keys(value) };
}

/** Compare container shapes without comparing ordinary property values.
 * Object/array keys are unordered; Map/Set entries are positional.
 * The caller supplies equality for Map keys and Set members.
 */
export function sameStructure(
  previous: Structure | null,
  current: Structure | null,
  sameMember: (previous: unknown, current: unknown) => boolean,
): boolean {
  if (!previous || !current) return previous === current;
  if (previous.kind !== current.kind) return false;

  if ("members" in previous) {
    if (!("members" in current)) return false;
    return previous.members.length === current.members.length &&
      previous.members.every((member, index) => sameMember(member, current.members[index]));
  }

  if ("members" in current) return false;

  if (previous.kind === "array" && current.kind === "array" &&
      previous.length !== current.length) return false;

  const currentKeys = new Set(current.keys);
  return previous.keys.length === current.keys.length &&
    previous.keys.every((key) => currentKeys.has(key));
}


