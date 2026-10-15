import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { VariableStoreKey } from "../../sugarcube/state";
import { readVariable, sameVariable, type VariableLocation } from "../location";
import { favoriteStore } from "../favorites";
import { variableWatcher } from "../watcher";

export const VariableScopeContext = createContext<VariableStoreKey | "favorites-tree" | null>(null);

function useScope(): VariableStoreKey | "favorites-tree" {
  const scope = useContext(VariableScopeContext);
  if (scope === null) throw new Error("Variable watcher requires a tree scope");
  return scope;
}

export function useVariable(location: VariableLocation) {
  const scope = useScope();
  const subscription = useMemo(
    () => location.kind === "favorite"
      ? favoriteStore.getSubscription(location.id)
      : variableWatcher.watch(() => readVariable(location), sameVariable, scope),
    [location, scope],
  );
  return useSyncExternalStore(subscription.subscribe, subscription.getSnapshot);
}


