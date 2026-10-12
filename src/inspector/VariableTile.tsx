import { useMemo, useState } from "react";
import type { VariableSlot } from "../inspection/variableSlots";
import { listChildren } from "../inspection/variableStructure";
import { useInView } from "react-intersection-observer";
import { useStructure, useVariable } from "./useVariableWatch";

const PAGE_SIZE = 100;

/** Each row subscribes to its own live location, not a copied parent entry. */
function VariableTile({
  slot, name, ancestors,
}: {
  slot: VariableSlot;
  name: string;
  ancestors: readonly object[];
}) {
  const { ref, inView: visible } = useInView();
  const current = useVariable(slot, visible);
  const [expanded, setExpanded] = useState(false);
  const circular = current.expandable && ancestors.includes(current.value as object);

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
      </div>
      {current.error && (
        <p role="alert" className="p-2 text-xs text-red-400">{current.error}</p>
      )}
      {expanded && current.expandable && !circular && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          <VariableChildren value={current.value as object} ancestors={ancestors} />
        </div>
      )}
    </div>
  );
}

/** Watches keys, collection membership and descriptors only while expanded. */
export function VariableChildren({
  value, ancestors,
}: {
  value: object;
  ancestors: readonly object[];
}) {
  const { ref, inView: visible } = useInView();
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

