import { isObject } from "@sindresorhus/is";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useCallback, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { type VariableStoreKey } from "../inspection/direct";
import type { VariableLocation } from "../inspection/variableLocation";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";
import { LiveVariableTreeItem, VariableTreeContext } from "./LiveVariableTreeItem";
import { useStructure, useVariable } from "./useVariableWatch";

function RichVariableTree({ storeKey, rootValue, visible }: {
  storeKey: VariableStoreKey;
  rootValue: object;
  visible: boolean;
}) {
  // Root changes are detected here; nested structural changes are detected by
  // LiveVariableTreeItem only for expanded, visible branches.
  const structure = useStructure(rootValue, visible);
  const [revision, setRevision] = useState(0);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expanded = useMemo(() => new Set(expandedItems), [expandedItems]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const rootNode = useMemo<VariableNode>(() => ({
    id: storeKey,
    name: storeKey,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);

  // No values are serialized. A changed structure regenerates the models, not
  // every 250ms value preview update.
  const items = useMemo(
    () => getVariableChildren(rootNode),
    [rootNode, rootValue, structure, revision],
  );
  const getLabel = useCallback((node: VariableNode) => node.name, []);
  const getId = useCallback((node: VariableNode) => node.id, []);
  const treeState = useMemo(() => ({ expanded, refresh }), [expanded, refresh]);

  return (
    <VariableTreeContext value={treeState}>
      <RichTreeView
        aria-label={storeKey === "variables" ? "Story variables tree" : "Temporary variables tree"}
        items={items}
        getItemChildren={getVariableChildren}
        getItemId={getId}
        getItemLabel={getLabel}
        disableSelection
        expansionTrigger="iconContainer"
        expandedItems={expandedItems}
        onExpandedItemsChange={(_, ids) => setExpandedItems(ids)}
        onItemExpansionToggle={(_, __, isExpanded) => {
          // Re-resolve live locations on opening even if the branch was offscreen.
          if (isExpanded) refresh();
        }}
        slots={{ item: LiveVariableTreeItem }}
      />
    </VariableTreeContext>
  );
}

export default function VariableTree({ storeKey }: { storeKey: VariableStoreKey }) {
  const { ref, inView: visible } = useInView();
  const location = useMemo<VariableLocation>(() => ({ kind: "state", key: storeKey }), [storeKey]);
  const root = useVariable(location, visible);

  return (
    <Box ref={ref}>
      {root.error ? (
        <Typography role="alert" variant="body2" color="error">{root.error}</Typography>
      ) : !root.exists ? (
        <Typography variant="body2" color="text.secondary">Store unavailable</Typography>
      ) : isObject(root.value) ? (
        <RichVariableTree storeKey={storeKey} rootValue={root.value} visible={visible} />
      ) : (
        <Typography variant="body2" color="text.secondary">{root.preview}</Typography>
      )}
    </Box>
  );
}
