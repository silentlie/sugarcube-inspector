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
import { withTimeout } from "../utils/withTimeout";

const RPC_TIMEOUT_MS = 3000;

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
    };

interface InspectorContextValue {
  state: InspectorState;
  refresh: () => void;
}

interface InspectorProviderProps {
  children: ReactNode;
}

const InspectorContext = createContext<InspectorContextValue | null>(null);

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
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
        );

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

    // Subscribe before requesting the initial snapshot.
    const unsubscribe = sugarcubeRPC.onMessage("passageChanged", () => {
      refresh();
    });

    refresh();

    return () => {
      mountedRef.current = false;
      ++requestIdRef.current;
      unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      state,
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
