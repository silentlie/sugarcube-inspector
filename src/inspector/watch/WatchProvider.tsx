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
  visible: boolean;
  favorite: boolean;
}

interface WatchContextValue {
  variables: Variables;
  favorites: ReadonlyMap<string, WatchTarget>;
  watchedTargets: readonly WatchTarget[];
  toggleFavorite: (target: WatchTarget) => void;
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
  // One registry holds active visible and favorite watches. Missing paths
  // stay registered when their variable row unmounts.
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, WatchRegistration>>(
    () => new Map(),
  );
  const registrationsRef = useRef(registrations);
  const currentVariables = view.source === snapshot ? view.variables : snapshot.variables;
  const variablesRef = useRef(currentVariables);

  useEffect(() => {
    registrationsRef.current = registrations;
  }, [registrations]);

  useEffect(() => {
    variablesRef.current = currentVariables;
  }, [currentVariables]);
  const setVisible = useCallback((target: WatchTarget, visible: boolean) => {
    setRegistrations((current) => {
      const key = watchKey(target);
      const existing = current.get(key);
      if ((!existing && !visible) || (existing && existing.visible === visible)) {
        return current;
      }
      const next = new Map(current);
      next.set(key, {
        target,
        visible,
        favorite: existing?.favorite ?? false,
      });
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((target: WatchTarget) => {
    setRegistrations((current) => {
      const key = watchKey(target);
      const existing = current.get(key);
      const next = new Map(current);
      next.set(key, {
        target,
        visible: existing?.visible ?? false,
        favorite: !existing?.favorite,
      });
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

      // Missing paths stay registered even after their rows disappear.
      const relevant = new Map(
        [...registrationsRef.current.entries()].filter(([, registration]) =>
          registration.visible || registration.favorite ||
          !watchPathExists(variablesRef.current, registration.target),
        ),
      );
      if (relevant.size !== registrationsRef.current.size) {
        registrationsRef.current = relevant;
        setRegistrations(relevant);
      }
      const targets = minimizeWatchTargets(
        [...relevant.values()].map(({ target }) => target),
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

        // Retain only registrations still visible, favorited, or missing.
        // When a missing path returns outside the viewport, it can be released.
        setRegistrations((current) => {
          const next = new Map(current);
          for (const [key, registration] of next) {
            if (!registration.visible && !registration.favorite &&
                watchPathExists(variablesRef.current, registration.target)) {
              next.delete(key);
            }
          }
          return next.size === current.size ? current : next;
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
