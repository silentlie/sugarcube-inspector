import { isArray, isArrayBuffer, isDate, isError, isMap, isRegExp, isSet, isWeakMap, isWeakSet } from "@sindresorhus/is";

interface ValuePreviewProps {
  value: unknown;
}

export function formatValue(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "undefined":
      return "undefined";

    case "string":
      return JSON.stringify(value);

    case "number":
      return Object.is(value, -0) ? "-0" : String(value);

    case "boolean":
      return String(value);

    case "bigint":
      return `${value}n`;

    case "symbol":
      return String(value);

    case "function":
      return value.name || "anonymous";
  }

  if (isArray(value)) {
    return `${value.length} items`;
  }

  if (isMap(value)) {
    return `${value.size} entries`;
  }

  if (isSet(value)) {
    return `${value.size} values`;
  }

  if (isDate(value)) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }

  if (isRegExp(value)) {
    return String(value);
  }

  if (isError(value)) {
    return value.message;
  }

  if (isArrayBuffer(value)) {
    return `${value.byteLength} bytes`;
  }

  if (ArrayBuffer.isView(value)) {
    return `${value.byteLength} bytes`;
  }

  if (isWeakMap(value) || isWeakSet(value)) {
    return "Contents unavailable";
  }

  return `${Object.keys(value).length} properties`;
}

function getValueColor(value: unknown): string {
  if (value == null) return "text-zinc-500";

  switch (typeof value) {
    case "string":
      return "text-emerald-400";

    case "number":
    case "bigint":
      return "text-sky-400";

    case "boolean":
      return "text-amber-400";

    case "undefined":
      return "text-zinc-500";

    default:
      return "text-zinc-400";
  }
}

export default function ValuePreview({ value }: ValuePreviewProps) {
  const formatted = formatValue(value);

  return (
    <span
      title={formatted}
      className={`block truncate font-mono ${getValueColor(value)} `}
    >
      {formatted}
    </span>
  );
}
