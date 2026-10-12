import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { createContext, useContext, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableSlot } from "../inspection/variableSlots";
import { listChildren } from "../inspection/variableStructure";
import { useStructure, useVariable } from "./useVariableWatch";

const PAGE_SIZE = 100;

/** MUI owns expansion and keyboard behavior; our watchers own live values. */
export const ExpandedTreeItemsContext = createContext<ReadonlySet<string>>(new Set());

function ExpandedChildren({
  expanded, value, ancestors, visible,
}: {
  expanded: boolean;
  value: object;
  ancestors: readonly object[];
  visible: boolean;
}) {
  // Keep this component as a TreeItem child even when collapsed so that MUI
  // knows the row can expand. Do not mount the structure watcher until open.
  if (!expanded) return null;
  return <VariableChildren value={value} ancestors={ancestors} visible={visible} />;
}

/** Each TreeItem keeps a direct subscription to its original live slot. */
function VariableTile({
  id, slot, name, ancestors,
}: {
  id: string;
  slot: VariableSlot;
  name: string;
  ancestors: readonly object[];
}) {
  const { ref, inView: visible } = useInView();
  const current = useVariable(slot, visible);
  const expandedItems = useContext(ExpandedTreeItemsContext);
  const expanded = expandedItems.has(id);
  const circular = current.expandable && ancestors.includes(current.value as object);
  const canExpand = current.expandable && !circular;

  return (
    <TreeItem itemId={id} ref={ref} disableSelection
      label={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>{name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap
            title={current.preview} sx={{ fontFamily: "monospace", maxWidth: "50%" }}>
            {current.preview}
          </Typography>
          {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
          {current.hidden && <Typography variant="caption" color="text.disabled">hidden</Typography>}
          {current.error && <Typography role="alert" variant="caption" color="error">{current.error}</Typography>}
        </Box>
      }>
      {canExpand && (
        <ExpandedChildren expanded={expanded} value={current.value as object}
          ancestors={ancestors} visible={visible} />
      )}
    </TreeItem>
  );
}

/** Discover children only while the owning TreeItem is expanded and visible. */
export function VariableChildren({
  value, ancestors, visible,
}: {
  value: object;
  ancestors: readonly object[];
  visible: boolean;
}) {
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

  if (structure.error) {
    return <li><Typography role="alert" variant="caption" color="error">{structure.error}</Typography></li>;
  }
  if (children.length === 0) {
    return <li><Typography variant="body2" color="text.secondary">No properties</Typography></li>;
  }
  return (
    <>
      {children.slice(0, limit).map((child) => (
        <VariableTile key={child.id} id={child.id} slot={child.slot}
          name={child.name} ancestors={lineage} />
      ))}
      {limit < children.length && (
        <li>
          <Button size="small" onClick={() => setLimit((count) => count + PAGE_SIZE)}>
            Load more ({Math.min(limit, children.length)}/{children.length})
          </Button>
        </li>
      )}
    </>
  );
}
