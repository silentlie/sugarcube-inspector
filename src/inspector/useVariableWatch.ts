import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { VariableStoreKey } from "../inspection/direct";
import { readVariable, sameVariable, type VariableLocation } from "../inspection/variableLocation";
import { readStructure, sameStructure } from "../inspection/variableStructure";
import { variableWatcher } from "../inspection/variableWatcher";

export const VariableScopeContext = createContext<VariableStoreKey | null>(null);

function useScope(): VariableStoreKey {
  const scope = useContext(VariableScopeContext);
  if (scope === null) throw new Error("Variable watcher requires a tree scope");
  return scope;
}

export function useVariable(location: VariableLocation) {
  const scope = useScope();
  const subscription = useMemo(
    () => variableWatcher.watch(() => readVariable(location), sameVariable, scope),
    [location, scope],
  );
  return useSyncExternalStore(subscription.subscribe, subscription.getSnapshot);
}

export function useStructure(value: object) {
  const scope = useScope();
  const subscription = useMemo(
    () => variableWatcher.watch(() => readStructure(value), sameStructure, scope),
    [value, scope],
  );
  return useSyncExternalStore(subscription.subscribe, subscription.getSnapshot);
}

