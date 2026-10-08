import { useInspector } from "./InspectorContext";
import Variables from "./Variables";

export default function InspectorContent() {
  const { snapshot, refresh } = useInspector();

  return (
    <div>
      <h1 className="text-lg font-semibold">SugarCube Inspector</h1>

      <p className="mt-1 text-sm text-zinc-400">
        {snapshot?.story.name ?? "Loading..."}
      </p>

      <hr className="my-4 border-zinc-800" />

      <button
        type="button"
        onClick={refresh}
        className="rounded bg-zinc-800 px-3 py-1 text-sm"
      >
        Refresh
      </button>

      <div className="mt-4">
        <Variables />
      </div>
    </div>
  );
}
