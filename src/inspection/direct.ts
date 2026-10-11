/** Direct references are intentionally kept inside the game's MAIN world. */
export type Scope = "story" | "temporary";

export function getStore(scope: Scope): unknown {
  const cube = (globalThis as typeof globalThis & {
    SugarCube?: { State?: { variables?: unknown; temporary?: unknown } };
  }).SugarCube;
  return scope === "story" ? cube?.State?.variables : cube?.State?.temporary;
}

export function isReference(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function preview(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "undefined": return "undefined";
    case "string": {
      const excerpt = value.length > 100 ? value.slice(0, 100) + "…" : value;
      return JSON.stringify(excerpt);
    }
    case "bigint":
    case "number":
    case "boolean":
    case "symbol": return String(value);
    case "function": return "[Function]";
    default:
      if (Array.isArray(value)) return `Array(${value.length})`;
      if (value instanceof Map) return `Map(${value.size})`;
      if (value instanceof Set) return `Set(${value.size})`;
      return "Object";
  }
}
