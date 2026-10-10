import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { VariableStore } from "./VariableStore";
import { useWatchPolling } from "./useWatchPolling";
import type { SugarCubeSnapshot, SugarCubeVariables } from "../../sugarcube/types";
import { pathToKey } from "../../sugarcube/variables/path";
import type { VariablePath } from "../../sugarcube/watch/types";

interface WatchContextValue {
  variables: SugarCubeVariables;
  store: VariableStore;
  favorites: ReadonlyMap<string, VariablePath>;
  watchedPaths: readonly VariablePath[];
  toggleFavorite: (path: VariablePath, favorite: boolean) => void;
  setVisible: (path: VariablePath, visible: boolean) => void;
  pollNow: () => void;
}

const WatchContext = createContext<WatchContextValue | null>(null);

export function WatchProvider({
  snapshot,
  onResync,
  children,
}: {
  snapshot: SugarCubeSnapshot;
  onResync?: () => void;
  children: ReactNode;
}) {
  const store = useMemo(() => new VariableStore(snapshot.variables), [snapshot]);
  const [favorites, setFavorites] = useState<ReadonlyMap<string, VariablePath>>(
    () => new Map(),
  );
  const favoritesRef = useRef(favorites);
  const visibleRef = useRef(new Map<string, VariablePath>());

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const setVisible = useCallback((path: VariablePath, isVisible: boolean) => {
    const key = pathToKey(path);
    if (isVisible) visibleRef.current.set(key, path);
    else visibleRef.current.delete(key);
  }, []);

  // Expansion requests an immediate poll without adding UI state to the RPC.

  // Explicit desired state is idempotent, even with repeated requests.
  const toggleFavorite = useCallback((path: VariablePath, favorite: boolean) => {
    setFavorites((current) => {
      const key = pathToKey(path);
      if (favorite === current.has(key)) return current;
      const next = new Map(current);
      if (favorite) next.set(key, path);
      else next.delete(key);
      return next;
    });
  }, []);

  const pollNow = useWatchPolling({
    snapshot, store, favoritesRef, visibleRef, onResync,
  });

  const value = useMemo<WatchContextValue>(() => ({
    variables: store.variables,
    store,
    favorites,
    // Only favorited missing paths remain watched when their rows unmount.
    watchedPaths: [...favorites.values()],
    toggleFavorite,
    setVisible,
    pollNow,
  }), [store, favorites, setVisible, toggleFavorite, pollNow]);

  return <WatchContext value={value}>{children}</WatchContext>;
}

export function useWatch(): WatchContextValue {
  const context = use(WatchContext);
  if (!context) throw new Error("useWatch must be used within WatchProvider");
  return context;
}
