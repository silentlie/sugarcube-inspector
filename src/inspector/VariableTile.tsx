import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemTitle } from "../components/ui/item";
import type { VariableSlot } from "../inspection/variableSlots";
import { listChildren } from "../inspection/variableStructure";
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
  const canExpand = current.expandable && !circular;

  return (
    <Collapsible ref={ref} open={expanded && canExpand} onOpenChange={setExpanded}>
      <Item size="sm">
        {canExpand ? (
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}>
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          </CollapsibleTrigger>
        ) : <span className="size-6 shrink-0" aria-hidden="true" />}
        <ItemContent className="min-w-0">
          <ItemTitle className="min-w-0 truncate">{name}</ItemTitle>
        </ItemContent>
        <ItemActions className="min-w-0 max-w-1/2">
          <span className="truncate font-mono text-xs text-muted-foreground"
            title={current.preview}>{current.preview}</span>
          {circular && <span className="text-xs text-muted-foreground">same reference</span>}
          {current.hidden && <span className="text-xs text-muted-foreground">hidden</span>}
        </ItemActions>
      </Item>
      {current.error && (
        <p role="alert" className="p-2 text-xs text-red-400">{current.error}</p>
      )}
      <CollapsibleContent className="ml-3 border-l border-border pl-2">
        {canExpand && <VariableChildren value={current.value as object} ancestors={ancestors} />}
      </CollapsibleContent>
    </Collapsible>
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
            <Button type="button" variant="ghost" size="sm"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              Load more ({Math.min(limit, children.length)}/{children.length})
            </Button>
          )}
        </>
      )}
    </div>
  );
}
