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

export const WATCH_INTERVAL_MS = 250;
export const WATCH_RECOMMENDATION_MS = 10;
export const WATCH_WARNING_MS = 50;
const WATCH_SAMPLE_COUNT = 20;

type Variables = SugarCubeSnapshot["variables"];
type Notice = { level: "recommendation" | "warning"; durationMs: number };

interface WatchContextValue {
  variables: Variables;
  favorites: ReadonlyMap<string, WatchTarget>;
  missingTargets: readonly WatchTarget[];
  toggleFavorite: (target: WatchTarget) => void;
  setVisible: (target: WatchTarget, visible: boolean) => void;
}

const WatchContext = createContext<WatchContextValue | null>(null);

function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
}

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
  const [favorites, setFavorites] = useState<ReadonlyMap<string, WatchTarget>>(
    () => new Map(),
  );
  const [missingTargets, setMissingTargets] = useState<readonly WatchTarget[]>([]);
  const visibleRef = useRef(new Map<string, WatchTarget>());
  const missingRef = useRef(new Map<string, WatchTarget>());
  const favoritesRef = useRef(favorites);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismissedRef = useRef(new Set<Notice["level"]>());

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

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
    let active = true;
    let busy = false;
    let timer: number | undefined;
    const durations: number[] = [];
    const generation = snapshot.watchGeneration ?? 0;

    function schedule(delay: number) {
      if (active) timer = window.setTimeout(() => void poll(), delay);
    }

    function recordDuration(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return;
      durations.push(ms);
      if (durations.length > WATCH_SAMPLE_COUNT) durations.shift();

      if (ms > WATCH_WARNING_MS) {
        if (!dismissedRef.current.has("warning")) {
          setNotice({ level: "warning", durationMs: Math.round(ms) });
        }
      } else if (durations.length === WATCH_SAMPLE_COUNT &&
                 p95(durations) > WATCH_RECOMMENDATION_MS &&
                 !dismissedRef.current.has("recommendation")) {
        setNotice((old) => old?.level === "warning" ? old :
          { level: "recommendation", durationMs: Math.round(p95(durations)) });
      } else if (durations.length === WATCH_SAMPLE_COUNT && p95(durations) <= 8) {
        setNotice((old) => old?.level === "recommendation" ? null : old);
      }
    }

    async function poll() {
      if (!active) return;
      if (busy || document.hidden) {
        schedule(WATCH_INTERVAL_MS);
        return;
      }

      const targets = minimizeWatchTargets([
        ...favoritesRef.current.values(),
        ...visibleRef.current.values(),
        ...missingRef.current.values(),
      ]);
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

        recordDuration(response.mainDurationMs);
        if (response.changes.length > 0) {
          setView((current) => ({
            source: snapshot,
            variables: applyWatchPatches(
              current.source === snapshot ? current.variables : snapshot.variables,
              response.changes,
            ),
          }));
        }

        const nextMissing = new Map(missingRef.current);
        for (const target of targets) nextMissing.delete(watchKey(target));
        for (const target of response.missingTargets) {
          nextMissing.set(watchKey(target), target);
        }
        const changed = nextMissing.size !== missingRef.current.size ||
          [...nextMissing.keys()].some((key) => !missingRef.current.has(key));
        missingRef.current = nextMissing;
        if (changed) setMissingTargets([...nextMissing.values()]);
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
    variables: view.source === snapshot ? view.variables : snapshot.variables,
    favorites,
    missingTargets,
    toggleFavorite,
    setVisible,
  }), [favorites, missingTargets, setVisible, snapshot, toggleFavorite, view]);

  return (
    <WatchContext value={value}>
      {notice !== null && (
        <div role="status" className="mt-2 flex items-start gap-2 rounded border border-amber-700/60 bg-amber-950/40 p-2 text-xs text-amber-200">
          <span className="min-w-0 flex-1">
            {notice.level === "warning"
              ? `Variable watching took ${notice.durationMs} ms in the game page and may cause stuttering.`
              : `Variable watching is taking about ${notice.durationMs} ms per poll in the game page and may affect responsiveness.`}
            {" "}Consider reducing watched variables.
          </span>
          <button type="button" onClick={() => {
            dismissedRef.current.add(notice.level);
            setNotice(null);
          }}
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
  if (!context) throw new Error("useWatch must be used within WatchProvider");
  return context;
}
