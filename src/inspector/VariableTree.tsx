import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useCallback, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { isReference, type VariableStoreKey } from "../inspection/direct";
import type { VariableLocation } from "../inspection/variableLocation";
import { getVariableChildren, isLoadMore, PAGE_SIZE, type VariableNode, type VariableTreeNode } from "../inspection/variableTree";
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
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expanded = useMemo(() => new Set(expandedItems), [expandedItems]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const loadMore = useCallback((parentId: string, shown: number) => {
    setLimits((previous) => new Map(previous).set(parentId, shown + PAGE_SIZE));
  }, []);

  const rootNode = useMemo<VariableNode>(() => ({
    id: storeKey,
    name: storeKey,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);

  // No values are serialized. A changed structure regenerates the models, not
  // every 250ms value preview update.
  const items = useMemo(
    () => getVariableChildren(rootNode, limits.get(rootNode.id) ?? PAGE_SIZE),
    [rootNode, rootValue, structure, limits, revision],
  );
  const getChildren = useCallback(
    (node: VariableTreeNode): VariableTreeNode[] => isLoadMore(node)
      ? []
      : getVariableChildren(node, limits.get(node.id) ?? PAGE_SIZE),
    [limits],
  );
  const getLabel = useCallback((node: VariableTreeNode) => node.name, []);
  const getId = useCallback((node: VariableTreeNode) => node.id, []);
  const treeState = useMemo(() => ({ expanded, refresh, loadMore }), [expanded, refresh, loadMore]);

  return (
    <VariableTreeContext value={treeState}>
      <RichTreeView
        aria-label={storeKey === "variables" ? "Story variables tree" : "Temporary variables tree"}
        items={items}
        getItemChildren={getChildren}
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
      {!root.exists ? (
        <Typography variant="body2" color="text.secondary">Waiting for SugarCube...</Typography>
      ) : root.error ? (
        <Typography role="alert" variant="body2" color="error">{root.error}</Typography>
      ) : isReference(root.value) ? (
        <RichVariableTree storeKey={storeKey} rootValue={root.value} visible={visible} />
      ) : (
        <Typography variant="body2" color="text.secondary">{root.preview}</Typography>
      )}
    </Box>
  );
}
