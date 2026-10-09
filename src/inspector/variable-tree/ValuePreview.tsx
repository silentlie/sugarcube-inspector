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

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (value instanceof Map) {
    return `${value.size} entries`;
  }

  if (value instanceof Set) {
    return `${value.size} values`;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }

  if (value instanceof RegExp) {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (value instanceof ArrayBuffer) {
    return `${value.byteLength} bytes`;
  }

  if (ArrayBuffer.isView(value)) {
    return `${value.byteLength} bytes`;
  }

  if (value instanceof WeakMap || value instanceof WeakSet) {
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
