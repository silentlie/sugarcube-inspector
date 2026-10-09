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
  type WatchTarget,
} from "../../sugarcube/watch";
import { withTimeout } from "../../utils/withTimeout";

export const WATCH_INTERVAL_MS = 750;
export const SLOW_WATCH_THRESHOLD_MS = 250;

type Variables = SugarCubeSnapshot["variables"];

interface WatchContextValue {
  variables: Variables;
  favorites: ReadonlyMap<string, WatchTarget>;
  toggleFavorite: (target: WatchTarget) => void;
  setVisible: (target: WatchTarget, visible: boolean) => void;
}

const WatchContext = createContext<WatchContextValue | null>(null);

export function WatchProvider({
  snapshot,
  children,
}: {
  snapshot: SugarCubeSnapshot;
  children: ReactNode;
}) {
  const [view, setView] = useState<{ source: SugarCubeSnapshot; variables: Variables }>({
    source: snapshot,
    variables: snapshot.variables,
  });
  const [favorites, setFavorites] = useState<ReadonlyMap<string, WatchTarget>>(
    () => new Map(),
  );
  const visibleRef = useRef(new Map<string, WatchTarget>());
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const [slowRequestMs, setSlowRequestMs] = useState<number | null>(null);

  const setVisible = useCallback((target: WatchTarget, visible: boolean) => {
    const key = watchKey(target);
    if (visible) visibleRef.current.set(key, target);
    else visibleRef.current.delete(key);
  }, []);

  const toggleFavorite = useCallback((target: WatchTarget) => {
    setFavorites((current) => {
      const next = new Map(current);
      const key = watchKey(target);
      if (next.has(key)) next.delete(key);
      else next.set(key, target);
      return next;
    });
  }, []);

  useEffect(() => {
    const session = crypto.randomUUID();
    let revision = 0;
    let active = true;
    let busy = false;

    async function poll() {
      if (!active || busy || document.hidden) return;
      const targets = minimizeWatchTargets([
        ...favoritesRef.current.values(),
        ...visibleRef.current.values(),
      ]);
      if (targets.length === 0) return;

      busy = true;
      const started = performance.now();
      try {
        const response = await withTimeout(
          sugarcubeRPC.sendMessage("getWatchChanges", {
            session, revision, targets,
          }),
        );
        const elapsed = performance.now() - started;
        if (!active) return;
        if (elapsed > SLOW_WATCH_THRESHOLD_MS) {
          setSlowRequestMs(Math.round(elapsed));
        }

        if (response.session !== session || response.baseRevision !== revision) {
          throw new Error("Watch response revision mismatch.");
        }

        revision = response.revision;
        if (response.patches.length > 0) {
          setView((current) => ({
            source: snapshot,
            variables: applyWatchPatches(
              current.source === snapshot ? current.variables : snapshot.variables,
              response.patches,
            ),
          }));
        }
      } catch (error) {
        if (active) console.error("[SugarCube Inspector] Watch poll failed:", error);
      } finally {
        busy = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), WATCH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [snapshot]);

  const value = useMemo<WatchContextValue>(() => ({
    variables: view.source === snapshot ? view.variables : snapshot.variables,
    favorites,
    toggleFavorite,
    setVisible,
  }), [favorites, setVisible, snapshot, toggleFavorite, view]);

  return (
    <WatchContext value={value}>
      {slowRequestMs !== null && (
        <div role="status" className="mt-2 flex items-start gap-2 rounded border border-amber-700/60 bg-amber-950/40 p-2 text-xs text-amber-200">
          <span className="min-w-0 flex-1">
            Watch request took {slowRequestMs} ms (warning threshold: {SLOW_WATCH_THRESHOLD_MS} ms).
            Large watched values may slow down the game.
          </span>
          <button type="button" onClick={() => setSlowRequestMs(null)}
            aria-label="Dismiss watch warning" className="shrink-0 text-amber-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}
      {children}
    </WatchContext>
  );
}

export function useWatch(): WatchContextValue {
  const context = use(WatchContext);
  if (!context) throw new Error("useWatch must be used inside WatchProvider");
  return context;
}
