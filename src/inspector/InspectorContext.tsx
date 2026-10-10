import { isError } from "@sindresorhus/is";
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

import { sugarcubeRPC } from "../sugarcube/rpc";
import {
  SugarCubeSnapshotSchema,
  type SugarCubeSnapshot,
} from "../sugarcube/types";
import { withTimeout } from "../utils/withTimeout";

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
  return isError(value) ? value : new Error(String(value));
}

async function readSnapshot(): Promise<SugarCubeSnapshot> {
  const result = await withTimeout(
    sugarcubeRPC.sendMessage("getSnapshot", undefined),
  );
  return SugarCubeSnapshotSchema.parse(result);
}

export function InspectorProvider({ children }: InspectorProviderProps) {
  const [state, setState] = useState<InspectorState>({
    status: "loading",
    snapshot: null,
  });

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const requestSnapshot = useCallback(() => {
    const requestId = ++requestIdRef.current;

    void readSnapshot().then(
      (snapshot) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setState({
          status: "ready",
          snapshot,
          refreshing: false,
        });
      },
      (cause: unknown) => {
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
      },
    );
  }, []);

  const refresh = useCallback(() => {
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

    void requestSnapshot();
  }, [requestSnapshot]);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = sugarcubeRPC.onMessage("passageChanged", refresh);

    // The initial state is already "loading".
    void requestSnapshot();

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [refresh, requestSnapshot]);

  const value = useMemo(
    () => ({
      state,
      refresh,
    }),
    [state, refresh],
  );

  return <InspectorContext value={value}>{children}</InspectorContext>;
}

export function useInspector(): InspectorContextValue {
  const context = use(InspectorContext);

  if (!context) {
    throw new Error("useInspector must be used within InspectorProvider");
  }

  return context;
}
