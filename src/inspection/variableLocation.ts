import detect, { isError, isObject } from "@sindresorhus/is";
import { getStore, preview, type VariableStoreKey } from "./direct";

/** A location is an owner/key pair, not a cloned value or a root-relative path. */
export type VariableLocation =
  | { kind: "state"; key: VariableStoreKey }
  | { kind: "property"; owner: object; key: PropertyKey }
  | { kind: "map-key"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "map-value"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "set-value"; owner: Set<unknown>; member: unknown };

export type VariableSnapshot = {
  exists: boolean;
  value: unknown;
  preview: string;
  type: string;
  expandable: boolean;
  hidden: boolean;
  accessor?: "getter" | "setter" | "getter/setter";
  error?: string;
};

function errorMessage(cause: unknown): string {
  return isError(cause) ? cause.message : String(cause);
}

function typeName(value: unknown): string {
  try {
    return detect(value);
  } catch {
    return "Object";
  }
}

function snapshot(
  value: unknown,
  exists: boolean,
  hidden = false,
  accessor?: VariableSnapshot["accessor"],
): VariableSnapshot {
  return {
    exists,
    value,
    preview: !exists ? "[Missing]" : accessor ? `[${accessor}]` : preview(value),
    type: !exists ? "missing" : accessor ?? typeName(value),
    expandable: exists && !accessor && isObject(value),
    hidden,
    ...(accessor && { accessor }),
  };
}

/** Only SugarCube's two trusted State getters may be read as accessors. */
export function readVariable(location: VariableLocation): VariableSnapshot {
  try {
    switch (location.kind) {
      case "state": {
        const value = getStore(location.key);
        return snapshot(value, value !== undefined);
      }
      case "property": {
        const descriptor = Object.getOwnPropertyDescriptor(location.owner, location.key);
        if (!descriptor) return snapshot(undefined, false);
        if (!("value" in descriptor)) {
          const accessor = descriptor.get && descriptor.set ? "getter/setter"
            : descriptor.get ? "getter" : "setter";
          return snapshot(undefined, true, !descriptor.enumerable, accessor);
        }
        return snapshot(descriptor.value, true, !descriptor.enumerable);
      }
      case "map-key": {
        const exists = Map.prototype.has.call(location.owner, location.key);
        return snapshot(location.key, exists);
      }
      case "map-value": {
        const exists = Map.prototype.has.call(location.owner, location.key);
        const value = exists ? Map.prototype.get.call(location.owner, location.key) : undefined;
        return snapshot(value, exists);
      }
      case "set-value":
        return snapshot(location.member, Set.prototype.has.call(location.owner, location.member));
    }
  } catch (cause) {
    return { ...snapshot(undefined, false), error: errorMessage(cause) };
  }
}

export function sameVariable(a: VariableSnapshot, b: VariableSnapshot): boolean {
  return a.exists === b.exists && Object.is(a.value, b.value) &&
    a.preview === b.preview && a.type === b.type && a.expandable === b.expandable &&
    a.hidden === b.hidden &&
    a.accessor === b.accessor && a.error === b.error;
}
