import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet, isWeakMap, isWeakSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";

type Structure =
  | { kind: "object" | "array"; keys: string[]; length?: number }
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

/** Map keys and Set values define the meaning of positional entry paths. */
export type CollectionMembers = { kind: "map" | "set"; entries: unknown[] };

export function collectionMembers(value: unknown): CollectionMembers | null {
  if (isMap(value)) return { kind: "map", entries: [...value.keys()] };
  if (isSet(value)) return { kind: "set", entries: [...value.values()] };
  return null;
}

/** Register collection prefixes from BOTH favorites and visible watches. */
