import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet, isWeakMap, isWeakSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import type { VariableChild } from "./types";

export function isExpandable(value: unknown): value is object {
  if (!isNonFunctionObject(value)) {
    return false;
  }

  if (isMap(value) || isSet(value)) {
    return true;
  }

  if (
    isDate(value) ||
    isRegExp(value) ||
    isError(value) ||
    isArrayBuffer(value) ||
    isWeakMap(value) ||
    isWeakSet(value) ||
    ArrayBuffer.isView(value)
  ) {
    return false;
  }

  // Empty containers must still be expandable so they can receive new children.
  return true;
}

export function isCircular(
  value: unknown,
  ancestors: readonly object[],
): boolean {
  return (
    isNonFunctionObject(value) && ancestors.includes(value)
  );
}

export function getChildren(value: unknown): VariableChild[] {
  if (!isExpandable(value)) {
    return [];
  }

  if (isMap(value)) {
    return Array.from(value.entries()).flatMap(
      ([key, entryValue], index): VariableChild[] => [
        {
          name: `[${index}].key`,
          value: key,
          segment: { type: "mapKey", index },
        },
        {
          name: `[${index}].value`,
          value: entryValue,
          segment: { type: "mapValue", index },
        },
      ],
    );
  }

  if (isSet(value)) {
    return Array.from(value.values(), (item, index) => ({
      name: `[${index}]`,
      value: item,
      segment: { type: "setValue" as const, index },
    }));
  }

  // Numeric indices are displayed in brackets, but every array entry
  // uses a regular property path. Named array properties keep their keys.
  const array = isArray(value);
  return Object.entries(value).map(([key, item]) => {
    const arrayIndex = array && /^(0|[1-9]\d*)$/.test(key) &&
      Number(key) < 2 ** 32 - 1;
    return {
      name: arrayIndex ? `[${key}]` : key,
      value: item,
      segment: { type: "property" as const, key },
    };
  });
}

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

/** Display a concrete tree path for circular-reference navigation. */
export function formatVariablePath(
  scope: "story" | "temporary",
  path: readonly import("./types").PathSegment[],
): string {
  const prefix = scope === "story" ? "$" : "_";
  return prefix + path.map((part, i) => {
    if (part.type === "property") {
      if (/^[A-Za-z_$][\w$]*$/.test(part.key)) {
        return (i === 0 ? "" : ".") + part.key;
      }
      return `[${JSON.stringify(part.key)}]`;
    }
    if (part.type === "setValue") return `[${part.index}]`;
    return `[${part.index}].${part.type === "mapKey" ? "key" : "value"}`;
  }).join("");
}
