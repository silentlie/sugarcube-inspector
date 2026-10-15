import { isArray, isFunction, isMap, isNull, isPrimitive, isSet, isString } from "@sindresorhus/is";

/**
 * The default @sindresorhus/is type detector intentionally rejects boxed primitives.
 * They are still valid live objects that an inspector must be able to examine.
 */
export function boxedPrimitive(value: unknown):
  | { type: "Number" | "String" | "Boolean" | "BigInt" | "Symbol"; value: string | number | boolean | bigint | symbol }
  | undefined {
  if (value instanceof Number) return { type: "Number", value: Number.prototype.valueOf.call(value) };
  if (value instanceof String) return { type: "String", value: String.prototype.valueOf.call(value) };
  if (value instanceof Boolean) return { type: "Boolean", value: Boolean.prototype.valueOf.call(value) };
  if (value instanceof BigInt) return { type: "BigInt", value: BigInt.prototype.valueOf.call(value) };
  if (value instanceof Symbol) return { type: "Symbol", value: Symbol.prototype.valueOf.call(value) };
  return undefined;
}

export function preview(value: unknown): string {
  if (isNull(value)) return "null";
  if (isString(value)) {
    const excerpt = value.length > 100 ? value.slice(0, 100) + "…" : value;
    return JSON.stringify(excerpt);
  }
  if (isFunction(value)) return "[Function]";
  if (isPrimitive(value)) return String(value);
  const boxed = boxedPrimitive(value);
  if (boxed) return preview(boxed.value);
  if (isArray(value)) return `Array(${value.length})`;
  if (isMap(value)) return `Map(${value.size})`;
  if (isSet(value)) return `Set(${value.size})`;
  return "Object";
}
