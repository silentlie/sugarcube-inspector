import detect from "@sindresorhus/is";
import { getStore, type VariableStoreKey } from "./direct";
import { boxedPrimitive, preview } from "./valuePreview";

/** A location retains live owners and keys, never copied values or root-relative paths. */
export type VariableLocation =
  | { kind: "state"; key: VariableStoreKey }
  | { kind: "property"; owner: object; key: PropertyKey }
  /** A Map entry is one node; part selects an expandable key or value child. */
  | { kind: "map"; owner: Map<unknown, unknown>; key: unknown; part?: "key" | "value" }
  | { kind: "set"; owner: Set<unknown>; member: unknown };

type AccessorKind = "getter" | "setter" | "getter/setter";

/** Previews are captured at read time so in-place mutations remain observable. */
export type VariableSnapshot =
  | { kind: "value"; value: unknown; preview: string; type: string }
  | { kind: "accessor"; accessor: AccessorKind }
  | { kind: "missing" };

function snapshot(value: unknown): VariableSnapshot {
  return {
    kind: "value",
    value,
    preview: preview(value),
    type: boxedPrimitive(value)?.type ?? detect(value),
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
    case "map":
      if (!Map.prototype.has.call(location.owner, location.key)) return { kind: "missing" };
      return snapshot(location.part === "key"
        ? location.key
        : Map.prototype.get.call(location.owner, location.key));
    case "set":
      return Set.prototype.has.call(location.owner, location.member)
        ? snapshot(location.member) : { kind: "missing" };
  }
}

export function sameVariable(a: VariableSnapshot, b: VariableSnapshot): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "value":
      return b.kind === "value" && Object.is(a.value, b.value) &&
        a.preview === b.preview && a.type === b.type;
    case "accessor":
      return b.kind === "accessor" && a.accessor === b.accessor;
    case "missing":
      return true;
  }
}
