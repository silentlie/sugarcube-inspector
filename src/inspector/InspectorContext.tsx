import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    CHANNEL,
    isSignal,
    isSnapshotMessage,
    type InspectorMessage,
} from "../sugarcube/protocol";

import type { SugarCubeSnapshot } from "../sugarcube/types";

interface InspectorContextValue {
  snapshot: SugarCubeSnapshot | null;
  refresh: () => void;
}

interface InspectorProviderProps {
  children: ReactNode;
}

const InspectorContext = createContext<InspectorContextValue | null>(null);

export function InspectorProvider({ children }: InspectorProviderProps) {
  const [snapshot, setSnapshot] = useState<SugarCubeSnapshot | null>(null);

  const refresh = useCallback(() => {
    window.postMessage(
      {
        channel: CHANNEL,
        type: "request",
      } satisfies InspectorMessage,
      "*",
    );
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== window) return;

      if (isSignal(event.data, "ready")) {
        refresh();
        return;
      }

      if (isSnapshotMessage(event.data)) {
        setSnapshot(event.data.data);
      }
    }

    window.addEventListener("message", handleMessage);

    // Request the initial snapshot.
    refresh();

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      snapshot,
      refresh,
    }),
    [snapshot, refresh],
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
