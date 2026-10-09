import { useInspector } from "./InspectorContext";
import InspectorError from "./InspectorError";
import Variables from "./Variables";

export default function InspectorContent() {
  const { state, refresh } = useInspector();

  return (
    <div>
      <h1 className="text-lg font-semibold">SugarCube Inspector</h1>

      <hr className="my-4 border-zinc-800" />

      {state.status === "loading" && (
        <p className="text-sm text-zinc-400">Loading SugarCube data...</p>
      )}

      {state.status === "error" && (
        <InspectorError error={state.error} onRetry={refresh} />
      )}

      {state.status === "ready" && (
        <>
          <p className="mb-4 text-sm text-zinc-400">
            {state.snapshot.story.name}
          </p>

          <button
            type="button"
            onClick={refresh}
            disabled={state.refreshing}
            className="mb-4 rounded bg-zinc-800 px-3 py-1 text-sm"
          >
            {state.refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <Variables snapshot={state.snapshot} />
        </>
      )}
    </div>
  );
}
