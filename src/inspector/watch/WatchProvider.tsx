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
import { applyWatchPatches } from "../../sugarcube/applyWatchPatches";
import type { SugarCubeSnapshot } from "../../sugarcube/types";
import {
  minimizeWatchTargets,
  watchKey,
  watchPathExists,
  type WatchTarget,
} from "../../sugarcube/watch";
import { withTimeout } from "../../utils/withTimeout";

export const WATCH_INTERVAL_MS = 250;
type Variables = SugarCubeSnapshot["variables"];

interface WatchRegistration {
  target: WatchTarget;
  favorite: boolean;
}

interface WatchContextValue {
  variables: Variables;
  favorites: ReadonlyMap<string, WatchTarget>;
  watchedTargets: readonly WatchTarget[];
  toggleFavorite: (target: WatchTarget, favorite: boolean) => void;
  setVisible: (target: WatchTarget, visible: boolean) => void;
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
  const [view, setView] = useState<{ source: SugarCubeSnapshot; variables: Variables }>({
    source: snapshot,
    variables: snapshot.variables,
  });
  // A single registry holds all watches. Visibility observations are kept
  // separately to release unfavorited watches once missing paths return.
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, WatchRegistration>>(
    () => new Map(),
  );
  const registrationsRef = useRef(registrations);
  const visibleKeysRef = useRef(new Set<string>());
  const currentVariables = view.source === snapshot ? view.variables : snapshot.variables;
  const variablesRef = useRef(currentVariables);

  useEffect(() => {
    registrationsRef.current = registrations;
  }, [registrations]);

  useEffect(() => {
    variablesRef.current = currentVariables;
  }, [currentVariables]);
  const setVisible = useCallback((target: WatchTarget, visible: boolean) => {
    const key = watchKey(target);
    if (visible) visibleKeysRef.current.add(key);
    else visibleKeysRef.current.delete(key);

    setRegistrations((current) => {
      const existing = current.get(key);
      if (visible) {
        if (existing) return current;
        return new Map(current).set(key, { target, favorite: false });
      }
      // A deleted path remains watched even after its row unmounts.
      if (!existing || existing.favorite || !watchPathExists(variablesRef.current, target)) {
        return current;
      }
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  // Accept desired state rather than inverting potentially stale state.
  const toggleFavorite = useCallback((target: WatchTarget, favorite: boolean) => {
    setRegistrations((current) => {
      const key = watchKey(target);
      const existing = current.get(key);
      if (existing?.favorite === favorite || (!existing && !favorite)) return current;
      const next = new Map(current);
      if (favorite || visibleKeysRef.current.has(key) ||
          !watchPathExists(variablesRef.current, target)) {
        next.set(key, { target, favorite });
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    let busy = false;
    let timer: number | undefined;
    const generation = snapshot.watchGeneration ?? 0;

    function schedule(delay: number) {
      if (active) timer = window.setTimeout(() => void poll(), delay);
    }

    async function poll() {
      if (!active) return;
      if (busy || document.hidden) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      const targets = minimizeWatchTargets(
        [...registrationsRef.current.values()].map(({ target }) => target),
      );
      if (targets.length === 0) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      busy = true;
      try {
        const response = await withTimeout(
          sugarcubeRPC.sendMessage("getWatchChanges", { generation, targets }),
        );
        if (!active) return;
        if (response.generation !== generation) {
          throw new Error("Watch snapshot generation mismatch.");
        }

        if (response.changes.length > 0) {
          const updated = applyWatchPatches(variablesRef.current, response.changes);
          variablesRef.current = updated;
          setView({ source: snapshot, variables: updated });
        }

        // Once a missing path returns, release it if its row is offscreen.
        setRegistrations((current) => {
          let next: Map<string, WatchRegistration> | undefined;
          for (const [key, registration] of current) {
            if (!registration.favorite && !visibleKeysRef.current.has(key) &&
                watchPathExists(variablesRef.current, registration.target)) {
              next ??= new Map(current);
              next.delete(key);
            }
          }
          return next ?? current;
        });
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
        schedule(WATCH_INTERVAL_MS);
      }
    }

    function onVisibilityChange() {
      if (!document.hidden && !busy) {
        window.clearTimeout(timer);
        schedule(0);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(WATCH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [snapshot, onResync]);

  const value = useMemo<WatchContextValue>(() => ({
    variables: currentVariables,
    favorites: new Map(
      [...registrations.entries()]
        .filter(([, registration]) => registration.favorite)
        .map(([key, registration]) => [key, registration.target]),
    ),
    watchedTargets: [...registrations.values()].map(({ target }) => target),
    toggleFavorite,
    setVisible,
  }), [currentVariables, registrations, setVisible, toggleFavorite]);

  return <WatchContext value={value}>{children}</WatchContext>;
}

export function useWatch(): WatchContextValue {
  const context = use(WatchContext);
  if (!context) throw new Error("useWatch must be used within WatchProvider");
  return context;
}
