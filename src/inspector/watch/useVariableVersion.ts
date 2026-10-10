import { useCallback, useMemo, useSyncExternalStore } from "react";
import { pathToKey } from "../../sugarcube/variables/path";
import type { VariablePath } from "../../sugarcube/watch/types";
import type { VariableStore } from "./VariableStore";

type Listener = () => void;

/** Subscribe to an individual node without depending on the root React state. */
export function useVariableVersion(store: VariableStore, path: VariablePath): number {
  const key = pathToKey(path);
  const stablePath = useMemo(() => path, [key]);
  const subscribe = useCallback(
    (listener: Listener) => store.subscribe(stablePath, listener),
    [store, stablePath],
  );
  const getVersion = useCallback(() => store.getVersion(key), [store, key]);
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useAnyVariableVersion(store: VariableStore): number {
  return useSyncExternalStore(
    store.subscribeAny,
    store.getAnyVersion,
    store.getAnyVersion,
  );
}
