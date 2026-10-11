import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet, isWeakMap, isWeakSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";

type Structure =
  | { kind: "object"; keys: string[] }
  | { kind: "array"; keys: string[]; length: number }
  | { kind: "map" | "set"; keys: unknown[] };

export function structureOf(value: unknown): Structure | null {
  if (!isNonFunctionObject(value)) return null;
  if (isArray(value)) {
    return { kind: "array", keys: Object.keys(value), length: value.length };
  }
  if (isMap(value)) return { kind: "map", keys: [...value.keys()] };
  if (isSet(value)) return { kind: "set", keys: [...value.values()] };
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

  if (previous.kind === "map" || previous.kind === "set") {
    return previous.keys.length === current.keys.length &&
      previous.keys.every((member, index) => sameMember(member, current.keys[index]));
  }

  if (previous.kind === "array" && current.kind === "array" &&
      previous.length !== current.length) return false;

  const currentKeys = new Set(current.keys);
  return previous.keys.length === current.keys.length &&
    previous.keys.every((key) => currentKeys.has(key));
}

/** Map keys and Set values define the meaning of positional entry paths. */
export type CollectionMembers = { kind: "map" | "set"; entries: unknown[] };

export function collectionMembers(value: unknown): CollectionMembers | null {
  if (isMap(value)) return { kind: "map", entries: [...value.keys()] };
  if (isSet(value)) return { kind: "set", entries: [...value.values()] };
  return null;
}

