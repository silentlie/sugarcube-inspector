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
  writableNumber: boolean;
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
  writable: boolean,
  hidden = false,
  accessor?: SlotSnapshot["accessor"],
): SlotSnapshot {
  return {
    exists,
    value,
    preview: !exists ? "[Missing]" : accessor ? `[${accessor}]` : preview(value),
    expandable: exists && !accessor && isReference(value),
    writableNumber: writable && typeof value === "number" && Number.isFinite(value),
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
        return snapshot(value, value !== undefined, false);
      }
      case "property": {
        const descriptor = Object.getOwnPropertyDescriptor(slot.owner, slot.key);
        if (!descriptor) return snapshot(undefined, false, false);
        if (!("value" in descriptor)) {
          const accessor = descriptor.get && descriptor.set ? "getter/setter"
            : descriptor.get ? "getter" : "setter";
          return snapshot(undefined, true, false, !descriptor.enumerable, accessor);
        }
        return snapshot(
          descriptor.value, true, descriptor.writable === true, !descriptor.enumerable,
        );
      }
      case "map-key": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        return snapshot(slot.key, exists, false);
      }
      case "map-value": {
        const exists = Map.prototype.has.call(slot.owner, slot.key);
        const value = exists ? Map.prototype.get.call(slot.owner, slot.key) : undefined;
        return snapshot(value, exists, exists);
      }
      case "set-value":
        return snapshot(slot.member, Set.prototype.has.call(slot.owner, slot.member), false);
    }
  } catch (cause) {
    return { ...snapshot(undefined, false, false), error: errorMessage(cause) };
  }
}

export function sameSlot(a: SlotSnapshot, b: SlotSnapshot): boolean {
  return a.exists === b.exists && Object.is(a.value, b.value) &&
    a.preview === b.preview && a.expandable === b.expandable &&
    a.writableNumber === b.writableNumber && a.hidden === b.hidden &&
    a.accessor === b.accessor && a.error === b.error;
}

export function incrementSlot(slot: VariableSlot): void {
  const current = readSlot(slot);
  if (!current.writableNumber || typeof current.value !== "number") {
    throw new Error("This property cannot be incremented.");
  }
  if (slot.kind === "property") {
    if (!Reflect.set(slot.owner, slot.key, current.value + 1)) {
      throw new Error("The game rejected the write.");
    }
  } else if (slot.kind === "map-value") {
    Map.prototype.set.call(slot.owner, slot.key, current.value + 1);
  } else {
    throw new Error("This property cannot be incremented.");
  }
}

