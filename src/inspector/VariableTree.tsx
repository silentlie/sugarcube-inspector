import { isObject } from "@sindresorhus/is";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { Profiler, useCallback, useMemo, useState } from "react";
import { bench } from "./rowBench.temp";
import { useInView } from "react-intersection-observer";
import { type VariableStoreKey } from "../inspection/direct";
import type { VariableLocation } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";
import { LiveVariableTreeItem, MinimalTreeItem, NoObserverTreeItem, VariableTreeContext } from "./LiveVariableTreeItem";
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
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);

  // No values are serialized. Structural changes regenerate tree models, not
  // every 250ms value preview update.
  const items = useMemo(
    () => getVariableChildren(rootNode),
    [rootNode, rootValue, structure, revision],
  );
  const getLabel = useCallback((node: VariableNode) => getLocationName(node.location), []);
  const getId = useCallback((node: VariableNode) => node.id, []);
  const treeState = useMemo(() => ({ expanded, refresh }), [expanded, refresh]);

  const variant = bench()?.variant ?? "baseline";
  const itemSlot = variant === "minimalRow" ? MinimalTreeItem
    : variant === "noObserver" ? NoObserverTreeItem : LiveVariableTreeItem;
  const itemChildren = useCallback((node: VariableNode) => {
    const children = getVariableChildren(node);
    return variant === "capped25" ? children.slice(0, 25) : children;
  }, [variant]);

  return (
    <VariableTreeContext value={treeState}>
      <Profiler id="variable-rows" onRender={(_, phase, duration) => {
        const state = bench();
        if (state) state.commits.push({ at: performance.now(), duration, phase });
      }}>
      <RichTreeView
        aria-label={storeKey === "variables" ? "Story variables tree" : "Temporary variables tree"}
        items={items}
        getItemChildren={itemChildren}
        getItemId={getId}
        getItemLabel={getLabel}
        disableSelection
        expansionTrigger="iconContainer"
        expandedItems={expandedItems}
        onExpandedItemsChange={(_, ids) => setExpandedItems(ids)}
        slots={{ item: itemSlot }}
      />
      </Profiler>
    </VariableTreeContext>
  );
}

export default function VariableTree({ storeKey }: { storeKey: VariableStoreKey }) {
  const { ref, inView: visible } = useInView();
  const location = useMemo<VariableLocation>(() => ({ kind: "state", key: storeKey }), [storeKey]);
  const root = useVariable(location, visible);

  return (
    <Box ref={ref}>
      {root.kind !== "value" ? (
        <Typography variant="body2" color="text.secondary">Store unavailable</Typography>
      ) : isObject(root.value) ? (
        <RichVariableTree storeKey={storeKey} rootValue={root.value} visible={visible} />
      ) : (
        <Typography variant="body2" color="text.secondary">{root.preview}</Typography>
      )}
    </Box>
  );
}
