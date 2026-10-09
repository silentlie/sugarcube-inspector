import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { sugarcubeRPC } from "../sugarcube/rpc";
import {
  SugarCubeSnapshotSchema,
  type SugarCubeSnapshot,
} from "../sugarcube/types";

const BRIDGE_READY_ATTRIBUTE = "data-sugarcube-inspector-ready";
const BRIDGE_READY_EVENT = "sugarcube-inspector:bridge-ready";
const PASSAGE_CHANGED_EVENT = "sugarcube-inspector:passage-changed";

const TIMEOUT_MS = 3000;

type InspectorState =
  | {
      status: "loading";
      snapshot: null;
    }
  | {
      status: "ready";
      snapshot: SugarCubeSnapshot;
      refreshing: boolean;
    }
  | {
      status: "error";
      snapshot: SugarCubeSnapshot | null;
      error: Error;
    }
  | {
      status: "unavailable";
      snapshot: null;
      error: Error;
    };

interface InspectorContextValue {
  state: InspectorState;
  snapshot: SugarCubeSnapshot | null;
  refresh: () => void;
}

interface InspectorProviderProps {
  children: ReactNode;
}

const InspectorContext = createContext<InspectorContextValue | null>(null);

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("SugarCube RPC request timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export function InspectorProvider({ children }: InspectorProviderProps) {
  const [state, setState] = useState<InspectorState>({
    status: "loading",
    snapshot: null,
  });

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const requestId = ++requestIdRef.current;

    setState((current) =>
      current.snapshot
        ? {
            status: "ready",
            snapshot: current.snapshot,
            refreshing: true,
          }
        : {
            status: "loading",
            snapshot: null,
          },
    );

    void (async () => {
      try {
        const result = await withTimeout(
          sugarcubeRPC.sendMessage("getSnapshot", undefined),
          TIMEOUT_MS,
        );

        // Contract violations intentionally throw.
        const snapshot = SugarCubeSnapshotSchema.parse(result);

        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setState({
          status: "ready",
          snapshot,
          refreshing: false,
        });
      } catch (cause) {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        const error = toError(cause);

        console.error("[SugarCube Inspector] Snapshot request failed:", cause);

        setState((current) => ({
          status: "error",
          snapshot: current.snapshot,
          error,
        }));
      }
    })();
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function handlePassageChanged() {
      refresh();
    }

    function handleBridgeReady() {
      if (!document.documentElement.hasAttribute(BRIDGE_READY_ATTRIBUTE)) {
        return;
      }

      window.clearTimeout(bridgeTimeoutId);
      window.removeEventListener(BRIDGE_READY_EVENT, handleBridgeReady);

      refresh();
    }

    const bridgeTimeoutId = window.setTimeout(() => {
      const error = new Error("SugarCube RPC bridge failed to initialise.");

      console.error("[SugarCube Inspector]", error);

      setState({
        status: "unavailable",
        snapshot: null,
        error,
      });
    }, TIMEOUT_MS);

    window.addEventListener(BRIDGE_READY_EVENT, handleBridgeReady);

    window.addEventListener(PASSAGE_CHANGED_EVENT, handlePassageChanged);

    // Handles a bridge that registered before React mounted.
    handleBridgeReady();

    return () => {
      mountedRef.current = false;
      ++requestIdRef.current;

      window.clearTimeout(bridgeTimeoutId);

      window.removeEventListener(BRIDGE_READY_EVENT, handleBridgeReady);

      window.removeEventListener(PASSAGE_CHANGED_EVENT, handlePassageChanged);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      state,
      snapshot: state.snapshot,
      refresh,
    }),
    [state, refresh],
  );

  return (
    <InspectorContext.Provider value={value}>
      {children}
    </InspectorContext.Provider>
  );
}

export function useInspector(): InspectorContextValue {
  const context = useContext(InspectorContext);

  if (!context) {
    throw new Error("useInspector must be used within InspectorProvider");
  }

  return context;
}
