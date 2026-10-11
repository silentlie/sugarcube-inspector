import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getStore, incrementDirect, inspectDirect, isReference,
  type DirectEntry, type Scope,
} from "../inspection/direct";

const PAGE_SIZE = 100;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PropertyRow({
  entry, ancestors, onWrite,
}: {
  entry: DirectEntry;
  ancestors: readonly object[];
  onWrite: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circular = isReference(entry.value) && ancestors.includes(entry.value);

  function increment(): void {
    try {
      incrementDirect(entry);
      setError(null);
      onWrite();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <div>
      <div className="flex min-w-0 items-baseline gap-2 rounded px-2 py-1.5 text-xs hover:bg-zinc-800">
        {entry.expandable && !circular ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
            aria-expanded={expanded}
            className="shrink-0 cursor-pointer text-zinc-400"
            onClick={() => setExpanded((old) => !old)}
          >{expanded ? "▾" : "▸"}</button>
        ) : <span className="inline-block w-3 shrink-0" />}
        <span className="min-w-0 truncate text-zinc-200">{entry.name}</span>
        <span className="ml-auto min-w-0 truncate font-mono text-zinc-400"
          title={entry.preview}>{entry.preview}</span>
        {circular && <span className="text-[10px] text-sky-400">same reference</span>}
        {entry.hidden && <span className="text-[10px] text-zinc-500">hidden</span>}
        {entry.incrementable && (
          <button type="button" aria-label={`Increment ${entry.name}`}
            className="cursor-pointer rounded border border-sky-500 px-1 text-sky-300"
            onClick={increment}>+1</button>
        )}
      </div>
      {error && <p role="alert" className="p-2 text-xs text-red-400">{error}</p>}
      {expanded && entry.expandable && !circular && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          <VariableList value={entry.value} ancestors={ancestors} onWrite={onWrite} />
        </div>
      )}
    </div>
  );
}

function VariableList({
  value, ancestors, onWrite,
}: {
  value: unknown;
  ancestors: readonly object[];
  onWrite: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  let entries: DirectEntry[];
  try {
    entries = inspectDirect(value);
  } catch (cause) {
    return <p role="alert" className="p-2 text-xs text-red-400">{errorText(cause)}</p>;
  }
  if (entries.length === 0) return <p className="p-2 text-xs text-zinc-500">No properties</p>;
  const nextAncestors = isReference(value) ? [...ancestors, value] : [...ancestors];

  return (
    <div>
      {entries.slice(0, limit).map((entry) => (
        <PropertyRow key={entry.name} entry={entry} ancestors={nextAncestors} onWrite={onWrite} />
      ))}
      {limit < entries.length && (
        <button type="button" className="p-2 text-xs text-sky-300"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}>
          Load more ({Math.min(limit, entries.length)}/{entries.length})
        </button>
      )}
    </div>
  );
}

/** This React component runs in MAIN world, with actual SugarCube references. */
export default function DirectInspector() {
  const [scope, setScope] = useState<Scope>("story");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(refresh);
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, [refresh]);

  useEffect(() => {
    // SugarCube can publish its stores before the startup passage populates
    // them. A present but initially empty store is not yet ready to display.
    const populated = () => {
      const store = getStore(scope);
      return isReference(store) && Reflect.ownKeys(store).length > 0;
    };
    // The store may have populated after React's render but before this
    // effect runs. Refresh once even when it is already populated here.
    if (populated()) {
      refresh();
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      refresh();
      if (populated() || attempts >= 20) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [scope, refresh]);

  // Reading this variable returns the game's actual object, not a snapshot.
  const store = getStore(scope);
  void revision;

  return (
    <section>
      <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-lg font-semibold">SugarCube Inspector</h1>
          <p className="text-xs text-sky-300">MAIN world · direct references</p>
        </div>
        <button type="button" aria-label="Refresh variables" title="Refresh variables"
          className="rounded p-2 text-zinc-300 hover:bg-zinc-800" onClick={refresh}>
          <RefreshCw size={16} />
        </button>
      </header>
      <p className="py-2 text-xs text-zinc-500">
        Property values remain live JS references. +1 changes writable numbers in the game.
      </p>
      <div role="tablist" aria-label="Variable scope" className="flex border-b border-zinc-700">
        {(["story", "temporary"] as const).map((option) => (
          <button key={option} role="tab" type="button"
            aria-selected={scope === option} onClick={() => setScope(option)}
            className={`px-3 py-2 text-xs ${scope === option
              ? "border-b-2 border-sky-400 text-white" : "text-zinc-400"}`}>
            {option === "story" ? "Story Variables" : "Temporary Variables"}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={scope === "story" ? "Story Variables" : "Temporary Variables"}>
        {store === undefined ? (
          <p className="p-2 text-xs text-zinc-500">Waiting for SugarCube...</p>
        ) : (
          <VariableList value={store} ancestors={[]} onWrite={refresh} />
        )}
      </div>
    </section>
  );
}
