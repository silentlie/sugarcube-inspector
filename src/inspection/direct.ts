import { isArray, isFunction, isMap, isNull, isPrimitive, isSet, isString } from "@sindresorhus/is";
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
