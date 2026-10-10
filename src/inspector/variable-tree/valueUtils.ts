import type { VariableChild } from "./types";

export function isExpandable(value: unknown): value is object {
  if (value === null || typeof value !== "object") {
    return false;
  }

  if (value instanceof Map || value instanceof Set) {
    return true;
  }

  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Error ||
    value instanceof ArrayBuffer ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
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
    value !== null && typeof value === "object" && ancestors.includes(value)
  );
}

export function getChildren(value: unknown): VariableChild[] {
  if (!isExpandable(value)) {
    return [];
  }

  if (value instanceof Map) {
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

  if (value instanceof Set) {
    return Array.from(value.values(), (item, index) => ({
      name: `[${index}]`,
      value: item,
      segment: { type: "setValue" as const, index },
    }));
  }

  // Numeric indices are displayed in brackets, but every array entry
  // uses a regular property path. Named array properties keep their keys.
  const isArray = Array.isArray(value);
  return Object.entries(value).map(([key, item]) => {
    const arrayIndex = isArray && /^(0|[1-9]\d*)$/.test(key) &&
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

  if (Array.isArray(value)) return "Array";
  if (value instanceof Map) return "Map";
  if (value instanceof Set) return "Set";
  if (value instanceof Date) return "Date";
  if (value instanceof RegExp) return "RegExp";
  if (value instanceof Error) return value.name;

  if (ArrayBuffer.isView(value)) {
    return value.constructor.name;
  }

  if (value instanceof ArrayBuffer) return "ArrayBuffer";

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
