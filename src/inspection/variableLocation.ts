import detect, { isObject } from "@sindresorhus/is";
import { getStore, type VariableStoreKey } from "./direct";
import { preview } from "./valuePreview";

/** A location is an owner/key pair, not a cloned value or a root-relative path. */
export type VariableLocation =
  | { kind: "state"; key: VariableStoreKey }
  | { kind: "property"; owner: object; key: PropertyKey }
  | { kind: "map-key"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "map-value"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "set-value"; owner: Set<unknown>; member: unknown };

type AccessorKind = "getter" | "setter" | "getter/setter";

/** Previews are captured at read time so in-place mutations remain observable. */
export type VariableSnapshot =
  | { kind: "value"; value: unknown; preview: string; type: string; expandable: boolean }
  | { kind: "accessor"; accessor: AccessorKind }
  | { kind: "missing" };

function snapshot(value: unknown): VariableSnapshot {
  return {
    kind: "value",
    value,
    preview: preview(value),
    type: detect(value),
    expandable: isObject(value),
  };
}

/** Only SugarCube's two trusted State getters may be read as accessors. */
export function readVariable(location: VariableLocation): VariableSnapshot {
  switch (location.kind) {
    case "state": {
      const value = getStore(location.key);
      return value === undefined ? { kind: "missing" } : snapshot(value);
    }
    case "property": {
      const descriptor = Object.getOwnPropertyDescriptor(location.owner, location.key);
      if (!descriptor) return { kind: "missing" };
      if (!("value" in descriptor)) {
        const accessor = descriptor.get && descriptor.set ? "getter/setter"
          : descriptor.get ? "getter" : "setter";
        return { kind: "accessor", accessor };
      }
      return snapshot(descriptor.value);
    }
    case "map-key":
      return Map.prototype.has.call(location.owner, location.key)
        ? snapshot(location.key) : { kind: "missing" };
    case "map-value":
      return Map.prototype.has.call(location.owner, location.key)
        ? snapshot(Map.prototype.get.call(location.owner, location.key))
        : { kind: "missing" };
    case "set-value":
      return Set.prototype.has.call(location.owner, location.member)
        ? snapshot(location.member) : { kind: "missing" };
  }
}

export function sameVariable(a: VariableSnapshot, b: VariableSnapshot): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "value":
      return b.kind === "value" && Object.is(a.value, b.value) &&
        a.preview === b.preview && a.type === b.type &&
        a.expandable === b.expandable;
    case "accessor":
      return b.kind === "accessor" && a.accessor === b.accessor;
    case "missing":
      return true;
  }
}
