import { useRef, useState } from "react";
import { formatFavoritePath, type FavoritePath } from "../location";
import { parseVariablePath } from "../search";

const scopes = { variables: "Story variables", temporary: "Temporary variables" } as const;

export default function VariableSearch({ find, reveal }: {
  find: (query: string) => FavoritePath[];
  reveal: (path: FavoritePath) => boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [matches, setMatches] = useState<FavoritePath[] | null>(null);
  const [error, setError] = useState("");

  return <form role="search" className="flex shrink-0 flex-col gap-1"
    onKeyDown={(event) => event.stopPropagation()}
    onSubmit={(event) => {
      event.preventDefault();
      const query = inputRef.current?.value.trim() ?? "";
      setError("");
      try {
        if (query.startsWith("$") || query.startsWith("_")) {
          setMatches(null);
          const path = parseVariablePath(query);
          if (!path) setError('Use a property path such as $player.stats[0]["health points"].');
          else if (!reveal(path)) setError("That variable is not available.");
        } else setMatches(query ? find(query.toLowerCase()) : null);
      } catch {
        setMatches(null);
        setError("Could not search variables.");
      }
    }}>
    <div className="flex items-center gap-1">
      <input ref={inputRef} type="search" aria-label="Search variables" placeholder="Name or path"
        className="min-w-0 flex-1 rounded border border-current px-2 py-1"
        onChange={() => { setMatches(null); setError(""); }} />
      <button type="submit" className="cursor-pointer rounded border border-current px-2 py-1">Search</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {matches?.length === 0 && <p role="status">No matching variables.</p>}
    {matches && matches.length > 0 && <div className="max-h-32 overflow-auto text-xs">
      {Object.entries(scopes).map(([scope, label]) => {
        const paths = matches.filter((path) => path.root === scope);
        if (paths.length === 0) return null;
        return <ul key={scope} aria-label={label}>
          <li aria-hidden="true" className="px-2 font-semibold">{label}</li>
          {paths.map((path) => {
            const title = formatFavoritePath(path);
            return <li key={title}>
              <button type="button" title={title}
                className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left font-mono hover:bg-white/10"
                onClick={() => {
                  try {
                    if (!reveal(path)) {
                      setError("That variable is no longer available. Search again.");
                      return;
                    }
                    setError("");
                    setMatches(null);
                    inputRef.current?.focus();
                  } catch {
                    setError("Could not open that variable.");
                  }
                }}>{title}</button>
            </li>;
          })}
        </ul>;
      })}
    </div>}
  </form>;
}
