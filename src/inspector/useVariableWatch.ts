import { useMemo, useSyncExternalStore } from "react";
import { readVariable, sameVariable, type VariableLocation } from "../inspection/variableLocation";
import { readStructure, sameStructure } from "../inspection/variableStructure";
import { variableWatcher } from "../inspection/variableWatcher";

const noSubscription = () => () => {};

export function useVariable(location: VariableLocation, visible: boolean) {
  const subscription = useMemo(
    () => variableWatcher.watch(() => readVariable(location), sameVariable),
    [location, visible],
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

