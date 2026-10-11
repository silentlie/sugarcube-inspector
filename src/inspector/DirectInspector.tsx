import { RefreshCw } from "lucide-react";
import {
  memo, useEffect, useMemo, useState, useSyncExternalStore,
} from "react";
import { isReference, type Scope } from "../inspection/direct";
import {
  incrementSlot, listChildren, readSlot, readStructure, sameSlot,
  sameStructure, variableWatcher, type VariableSlot,
} from "../inspection/variableTree";
import { useObservedVisibility } from "./useObservedVisibility";

const PAGE_SIZE = 100;

const noSubscription = () => () => {};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function useVariable(slot: VariableSlot, visible: boolean) {
  const subscription = useMemo(
    () => variableWatcher.watch(() => readSlot(slot), sameSlot),
    [slot, visible],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

function useStructure(value: object, visible: boolean) {
  const subscription = useMemo(
    () => variableWatcher.watch(() => readStructure(value), sameStructure),
    [value, visible],
  );
  return useSyncExternalStore(
    visible ? subscription.subscribe : noSubscription,
    subscription.getSnapshot,
  );
}

/** Each row subscribes to its own live location, not a copied parent entry. */
const VariableTile = memo(function VariableTile({
  slot, name, ancestors,
}: {
  slot: VariableSlot;
  name: string;
  ancestors: readonly object[];
}) {
  const { ref, visible } = useObservedVisibility();
  const current = useVariable(slot, visible);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circular = current.expandable && ancestors.includes(current.value as object);

  function increment(): void {
    try {
      incrementSlot(slot);
      setError(null);
      variableWatcher.refresh();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <div ref={ref}>
      <div className="flex min-w-0 items-baseline gap-2 rounded px-2 py-1.5 text-xs hover:bg-zinc-800">
        {current.expandable && !circular ? (
          <button type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
            aria-expanded={expanded}
            className="shrink-0 cursor-pointer text-zinc-400"
            onClick={() => setExpanded((old) => !old)}>
            {expanded ? "▾" : "▸"}
          </button>
        ) : <span className="inline-block w-3 shrink-0" />}
        <span className="min-w-0 truncate text-zinc-200">{name}</span>
        <span className="ml-auto min-w-0 truncate font-mono text-zinc-400"
          title={current.preview}>{current.preview}</span>
        {circular && <span className="text-[10px] text-sky-400">same reference</span>}
        {current.hidden && <span className="text-[10px] text-zinc-500">hidden</span>}
        {current.writableNumber && (
          <button type="button" aria-label={`Increment ${name}`}
            className="cursor-pointer rounded border border-sky-500 px-1 text-sky-300"
            onClick={increment}>+1</button>
        )}
      </div>
      {(error || current.error) && (
        <p role="alert" className="p-2 text-xs text-red-400">{error || current.error}</p>
      )}
      {expanded && current.expandable && !circular && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          <VariableChildren value={current.value as object} ancestors={ancestors} />
        </div>
      )}
    </div>
  );
});

/** Watches keys, collection membership and descriptors only while expanded. */
function VariableChildren({
  value, ancestors,
}: {
  value: object;
  ancestors: readonly object[];
}) {
  const { ref, visible } = useObservedVisibility();
  const structure = useStructure(value, visible);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const lineage = useMemo(() => [...ancestors, value], [ancestors, value]);
  const children = useMemo(() => {
    if (structure.error) return [];
    try {
      return listChildren(value);
    } catch {
      return [];
    }
  }, [value, structure]);

  return (
    <div ref={ref}>
      {structure.error ? (
        <p role="alert" className="p-2 text-xs text-red-400">{structure.error}</p>
      ) : children.length === 0 ? (
        <p className="p-2 text-xs text-zinc-500">No properties</p>
      ) : (
        <>
          {children.slice(0, limit).map((child) => (
            <VariableTile key={child.id} slot={child.slot} name={child.name}
              ancestors={lineage} />
          ))}
          {limit < children.length && (
            <button type="button" className="p-2 text-xs text-sky-300"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Load more ({Math.min(limit, children.length)}/{children.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function VariableTree({ scope }: { scope: Scope }) {
  const { ref, visible } = useObservedVisibility();
  const slot = useMemo<VariableSlot>(() => ({ kind: "root", scope }), [scope]);
  const root = useVariable(slot, visible);

  return (
    <div ref={ref}>
      {!root.exists ? (
        <p className="p-2 text-xs text-zinc-500">Waiting for SugarCube...</p>
      ) : root.error ? (
        <p role="alert" className="p-2 text-xs text-red-400">{root.error}</p>
      ) : isReference(root.value) ? (
        <VariableChildren value={root.value} ancestors={[]} />
      ) : (
        <p className="p-2 text-xs text-zinc-500">{root.preview}</p>
      )}
    </div>
  );
}

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
export default function DirectInspector() {
  const [scope, setScope] = useState<Scope>("story");

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => variableWatcher.refresh());
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <section>
      <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-lg font-semibold">SugarCube Inspector</h1>
          <p className="text-xs text-sky-300">MAIN world · direct references</p>
        </div>
        <button type="button" aria-label="Refresh variables" title="Refresh variables"
          className="rounded p-2 text-zinc-300 hover:bg-zinc-800"
          onClick={() => variableWatcher.refresh()}>
          <RefreshCw size={16} />
        </button>
      </header>
      <p className="py-2 text-xs text-zinc-500">
        Live variable tiles update independently. +1 edits actual game values.
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
        <VariableTree scope={scope} />
      </div>
    </section>
  );
}
