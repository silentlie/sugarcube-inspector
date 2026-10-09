import { Pin, RefreshCw } from "lucide-react";
import { useInspector } from "./InspectorContext";
import InspectorError from "./InspectorError";
import Variables from "./Variables";
import { WatchProvider } from "./watch/WatchProvider";

export default function InspectorContent() {
  const { state, refresh } = useInspector();

  const snapshot =
    state.status === "ready" || state.status === "error"
      ? state.snapshot
      : null;

  const title = snapshot?.story.name ?? "Loading story...";

  const refreshing = state.status === "ready" && state.refreshing;

  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2">
        <h1 title={title} className="min-w-0 truncate text-lg font-semibold">
          {title}
        </h1>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled
            title="Pin inspector (coming soon)"
            aria-label="Pin inspector (coming soon)"
            className="rounded p-2 text-zinc-500 disabled:cursor-not-allowed"
          >
            <Pin className="size-4" />
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={state.status !== "ready" || refreshing}
            title="Refresh snapshot"
            aria-label="Refresh snapshot"
            className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-zinc-400">Loading SugarCube data...</p>
      )}

      {state.status === "error" && (
        <InspectorError error={state.error} onRetry={refresh} />
      )}

      {state.status === "ready" && (
        <WatchProvider snapshot={state.snapshot}>
          <Variables snapshot={state.snapshot} />
        </WatchProvider>
      )}
    </div>
  );
}
