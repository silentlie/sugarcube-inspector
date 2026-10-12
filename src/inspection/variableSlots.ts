import { getStore, isReference, preview, type Scope } from "./direct";

export type VariableSlot =
  | { kind: "root"; scope: Scope }
  | { kind: "property"; owner: object; key: PropertyKey }
  | { kind: "map-key"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "map-value"; owner: Map<unknown, unknown>; key: unknown }
  | { kind: "set-value"; owner: Set<unknown>; member: unknown };

export type SlotSnapshot = {
  exists: boolean;
  value: unknown;
  preview: string;
  expandable: boolean;
  hidden: boolean;
  accessor?: "getter" | "setter" | "getter/setter";
  error?: string;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function snapshot(
  value: unknown,
  exists: boolean,
  hidden = false,
  accessor?: SlotSnapshot["accessor"],
): SlotSnapshot {
  return {
    exists,
    value,
    preview: !exists ? "[Missing]" : accessor ? `[${accessor}]` : preview(value),
    expandable: exists && !accessor && isReference(value),
    hidden,
    ...(accessor && { accessor }),
  };
}

/** Read the current slot directly, without triggering an ordinary property getter. */
export function readSlot(slot: VariableSlot): SlotSnapshot {
  try {
    switch (slot.kind) {
      case "root": {
        const value = getStore(slot.scope);
        return snapshot(value, value !== undefined);
      }
      case "property": {
        const descriptor = Object.getOwnPropertyDescriptor(slot.owner, slot.key);
        if (!descriptor) return snapshot(undefined, false);
        if (!("value" in descriptor)) {
          const accessor = descriptor.get && descriptor.set ? "getter/setter"
            : descriptor.get ? "getter" : "setter";
          return snapshot(undefined, true, !descriptor.enumerable, accessor);
        }
        return snapshot(descriptor.value, true, !descriptor.enumerable);
      }
      case "map-key": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        return snapshot(slot.key, exists);
      }
      case "map-value": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        const value = exists ? Map.prototype.get.call(slot.owner, slot.key) : undefined;
        return snapshot(value, exists);
      }
      case "set-value":
        return snapshot(slot.member, Set.prototype.has.call(slot.owner, slot.member));
    }
  } catch (cause) {
    return { ...snapshot(undefined, false), error: errorMessage(cause) };
  }
}

export function sameSlot(a: SlotSnapshot, b: SlotSnapshot): boolean {
  return a.exists === b.exists && Object.is(a.value, b.value) &&
    a.preview === b.preview && a.expandable === b.expandable &&
    a.hidden === b.hidden &&
    a.accessor === b.accessor && a.error === b.error;
}

