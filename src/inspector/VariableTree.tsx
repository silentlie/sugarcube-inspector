import { useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { isReference, type Scope } from "../inspection/direct";
import type { VariableSlot } from "../inspection/variableSlots";
import { useVariable } from "./useVariableWatch";
import { ExpandedTreeItemsContext, VariableChildren } from "./VariableTile";

export default function VariableTree({ scope }: { scope: Scope }) {
  const { ref, inView: visible } = useInView();
  const slot = useMemo<VariableSlot>(() => ({ kind: "root", scope }), [scope]);
  const root = useVariable(slot, visible);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedItems), [expandedItems]);

  return (
    <Box ref={ref}>
      {!root.exists ? (
        <Typography variant="body2" color="text.secondary">Waiting for SugarCube...</Typography>
      ) : root.error ? (
        <Typography role="alert" variant="body2" color="error">{root.error}</Typography>
      ) : isReference(root.value) ? (
        <ExpandedTreeItemsContext value={expandedSet}>
          <SimpleTreeView aria-label={scope === "story" ? "Story variables tree" : "Temporary variables tree"}
            disableSelection expansionTrigger="iconContainer"
            expandedItems={expandedItems}
            onExpandedItemsChange={(_, items) => setExpandedItems(items)}>
            <VariableChildren value={root.value} ancestors={[]} visible={visible} />
          </SimpleTreeView>
        </ExpandedTreeItemsContext>
      ) : (
        <Typography variant="body2" color="text.secondary">{root.preview}</Typography>
      )}
    </Box>
  );
}
