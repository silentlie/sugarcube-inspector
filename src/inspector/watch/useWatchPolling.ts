import { useCallback, useEffect, useRef, type RefObject } from "react";
import { sugarcubeRPC } from "../../sugarcube/rpc";
import type { SugarCubeSnapshot } from "../../sugarcube/types";
import type { VariablePath } from "../../sugarcube/watch/types";
import { withTimeout } from "../../utils/withTimeout";
import type { VariableStore } from "./VariableStore";

export const WATCH_INTERVAL_MS = 250;

interface PollingOptions {
  snapshot: SugarCubeSnapshot;
  store: VariableStore;
  favoritesRef: RefObject<ReadonlyMap<string, VariablePath>>;
  visibleRef: RefObject<Map<string, VariablePath>>;
  onResync?: () => void;
}

/** Poll schedule, page visibility pause, immediate expansion, and recovery. */
export function useWatchPolling({
  snapshot, store, favoritesRef, visibleRef, onResync,
}: PollingOptions): () => void {
  const wakeRef = useRef<(() => void) | null>(null);
  const pollNow = useCallback(() => wakeRef.current?.(), []);

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

  return pollNow;
}
