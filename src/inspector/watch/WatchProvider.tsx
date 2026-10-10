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
import type { SugarCubeSnapshot } from "../../sugarcube/types";
import {
  watchKey,
  type WatchTarget,
} from "../../sugarcube/watch";
import { withTimeout } from "../../utils/withTimeout";

export const WATCH_INTERVAL_MS = 250;

interface WatchContextValue {
  variables: SugarCubeSnapshot["variables"];
  store: VariableStore;
  favorites: ReadonlyMap<string, WatchTarget>;
  watchedTargets: readonly WatchTarget[];
  toggleFavorite: (target: WatchTarget, favorite: boolean) => void;
  setVisible: (target: WatchTarget, visible: boolean) => void;
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
  const [favorites, setFavorites] = useState<ReadonlyMap<string, WatchTarget>>(
    () => new Map(),
  );
  const favoritesRef = useRef(favorites);
  const visibleRef = useRef(new Map<string, WatchTarget>());
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const setVisible = useCallback((target: WatchTarget, isVisible: boolean) => {
    const key = watchKey(target);
    if (isVisible) visibleRef.current.set(key, target);
    else visibleRef.current.delete(key);
  }, []);

  // Expansion requests an immediate poll without adding UI state to the RPC.
  const pollNow = useCallback(() => wakeRef.current?.(), []);

  // Explicit desired state is idempotent, even with repeated requests.
  const toggleFavorite = useCallback((target: WatchTarget, favorite: boolean) => {
    setFavorites((current) => {
      const key = watchKey(target);
      if (favorite === current.has(key)) return current;
      const next = new Map(current);
      if (favorite) next.set(key, target);
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

      const favoriteTargets = [...favoritesRef.current.values()];
      // Include the active scope root on every poll for shallow structural
      // discovery, independently of visible scalar and expanded value watches.
      const visibleTargets = [...visibleRef.current.values()];
      if (favoriteTargets.length === 0 && visibleTargets.length === 0) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      busy = true;
      try {
        const response = await withTimeout(
          sugarcubeRPC.sendMessage("getWatchChanges", {
            generation, favorites: favoriteTargets, visible: visibleTargets,
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
    watchedTargets: [...favorites.values()],
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
