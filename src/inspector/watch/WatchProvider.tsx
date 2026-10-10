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
import { sugarcubeRPC } from "../../sugarcube/rpc";
import { VariableStore } from "./VariableStore";
import type { SugarCubeSnapshot, SugarCubeVariables } from "../../sugarcube/types";
import { pathToKey } from "../../sugarcube/variables/path";
import type { VariablePath } from "../../sugarcube/watch/types";
import { withTimeout } from "../../utils/withTimeout";

export const WATCH_INTERVAL_MS = 250;

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
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const setVisible = useCallback((path: VariablePath, isVisible: boolean) => {
    const key = pathToKey(path);
    if (isVisible) visibleRef.current.set(key, path);
    else visibleRef.current.delete(key);
  }, []);

  // Expansion requests an immediate poll without adding UI state to the RPC.
  const pollNow = useCallback(() => wakeRef.current?.(), []);

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

  useEffect(() => {
    let active = true;
    let busy = false;
    let timer: number | undefined;
    let immediateAfterBusy = false;
    const generation = snapshot.watchGeneration ?? 0;

    function schedule(delay: number) {
      if (!active) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    }

    function wake() {
      if (document.hidden) return;
      if (busy) {
        immediateAfterBusy = true;
      } else {
        schedule(0);
      }
    }

    wakeRef.current = wake;

    async function poll() {
      if (!active) return;
      if (busy || document.hidden) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      const favoritePaths = [...favoritesRef.current.values()];
      // Include the active scope root on every poll for shallow structural
      // discovery, independently of visible scalar and expanded value watches.
      const visiblePaths = [...visibleRef.current.values()];
      if (favoritePaths.length === 0 && visiblePaths.length === 0) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      busy = true;
      try {
        const response = await withTimeout(
          sugarcubeRPC.sendMessage("getWatchChanges", {
            generation, favorites: favoritePaths, visible: visiblePaths,
          }),
        );
        if (!active) return;
        if (response.generation !== generation) {
          throw new Error("Watch snapshot generation mismatch.");
        }

        if (response.changes.length > 0) {
          store.apply(response.changes);
        }
      } catch (error) {
        if (active) {
          console.error("[SugarCube Inspector] Watch poll failed:", error);
          // A lost reply can advance MAIN's cache without updating the UI.
          // A fresh snapshot is simpler and safer than per-poll acknowledgments.
          active = false;
          onResync?.();
        }
      } finally {
        busy = false;
        schedule(immediateAfterBusy ? 0 : WATCH_INTERVAL_MS);
        immediateAfterBusy = false;
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) wake();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(WATCH_INTERVAL_MS);
    return () => {
      active = false;
      wakeRef.current = null;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [snapshot, store, onResync]);

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
