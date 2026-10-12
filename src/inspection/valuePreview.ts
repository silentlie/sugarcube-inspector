import { isArray, isFunction, isMap, isNull, isPrimitive, isSet, isString } from "@sindresorhus/is";

export function preview(value: unknown): string {
  if (isNull(value)) return "null";
  if (isString(value)) {
    const excerpt = value.length > 100 ? value.slice(0, 100) + "…" : value;
    return JSON.stringify(excerpt);
  }
  if (isFunction(value)) return "[Function]";
  if (isPrimitive(value)) return String(value);
  if (isArray(value)) return `Array(${value.length})`;
  if (isMap(value)) return `Map(${value.size})`;
  if (isSet(value)) return `Set(${value.size})`;
  return "Object";
}
