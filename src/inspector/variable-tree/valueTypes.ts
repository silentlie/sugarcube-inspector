import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet } from "@sindresorhus/is";

export function getValueType(value: unknown): string {
  if (value === null) return "null";

  if (isArray(value)) return "Array";
  if (isMap(value)) return "Map";
  if (isSet(value)) return "Set";
  if (isDate(value)) return "Date";
  if (isRegExp(value)) return "RegExp";
  if (isError(value)) return value.name;

  if (ArrayBuffer.isView(value)) {
    return value.constructor.name;
  }

  if (isArrayBuffer(value)) return "ArrayBuffer";

  return typeof value === "object" ? "Object" : typeof value;
}

