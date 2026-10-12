import type { StateAPI } from "twine-sugarcube";

/** These keys are checked against SugarCube's StateAPI, not an independent scope enum. */
export type VariableStoreKey = keyof Pick<StateAPI, "variables" | "temporary">;

/** SugarCube may not have initialized when our MAIN-world content script mounts. */
export function getState(): StateAPI | undefined {
  const cube = (globalThis as typeof globalThis & {
    SugarCube?: { State?: StateAPI };
  }).SugarCube;
  return cube?.State;
}

export function getStore(key: VariableStoreKey): unknown {
  return getState()?.[key];
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
