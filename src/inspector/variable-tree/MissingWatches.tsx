import { Star } from "lucide-react";
import { useWatch } from "../watch/WatchProvider";
import { useAnyVariableVersion } from "../watch/useVariableVersion";
import { pathToKey, resolvePath } from "../../sugarcube/variables/path";
import type { VariableScope } from "../../sugarcube/watch/types";
import { formatVariablePath } from "./formatVariablePath";

export default function MissingWatches({ scope }: { scope: VariableScope }) {
  const watch = useWatch();
  useAnyVariableVersion(watch.store);
  const targets = watch.watchedPaths.filter((path) =>
    path[0].key === scope && !resolvePath(watch.variables, path).exists,
  );
  if (targets.length === 0) return null;
  return (
    <section aria-label="Missing watched variables" className="mt-3 border-t border-zinc-800 pt-2">
      <p className="mb-1 text-zinc-500">Missing watched variables (read-only)</p>
      {targets.map((path) => {
        const name = formatVariablePath(scope, path.slice(1));
        return <div key={pathToKey(path)}
          className="flex gap-2 px-2 py-1 font-mono text-zinc-500">
          <span className="min-w-0 truncate">{name}</span>
          <span className="ml-auto">Missing</span>
          <button
            type="button"
            aria-label={`Unfavorite ${name}`}
            title="Remove favorite"
            onClick={() => watch.toggleFavorite(path, false)}
            className="shrink-0 rounded p-1 text-amber-400 focus-visible:outline-2 focus-visible:outline-zinc-400"
          >
            <Star size={14} fill="currentColor" aria-hidden="true" />
          </button>
        </div>;
      })}
    </section>
  );
}
