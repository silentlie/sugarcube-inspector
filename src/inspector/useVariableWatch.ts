import { useMemo, useSyncExternalStore } from "react";
import { readSlot, sameSlot, type VariableSlot } from "../inspection/variableSlots";
import { readStructure, sameStructure } from "../inspection/variableStructure";
import { variableWatcher } from "../inspection/variableWatcher";

const noSubscription = () => () => {};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useVariable(slot: VariableSlot, visible: boolean) {
  const subscription = useMemo(
    () => variableWatcher.watch(() => readSlot(slot), sameSlot),
    [slot, visible],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

export function useStructure(value: object, visible: boolean) {
  const subscription = useMemo(
    () => variableWatcher.watch(() => readStructure(value), sameStructure),
    [value, visible],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

