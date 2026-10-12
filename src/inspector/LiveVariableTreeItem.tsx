import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { TreeItem, type TreeItemProps } from "@mui/x-tree-view/TreeItem";
import { useTreeItemModel } from "@mui/x-tree-view/hooks";
import { createContext, useContext, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableNode, VariableTreeNode } from "../inspection/variableTree";
import { isLoadMore } from "../inspection/variableTree";
import { isReference } from "../inspection/direct";
import { useStructure, useVariable } from "./useVariableWatch";

type TreeState = {
  expanded: ReadonlySet<string>;
  refresh: () => void;
  loadMore: (parentId: string, shown: number) => void;
};

export const VariableTreeContext = createContext<TreeState>({
  expanded: new Set(),
  refresh: () => {},
  loadMore: () => {},
});

/** Watch the structure of an expanded, visible value without polling collapsed branches. */
function VisibleStructureWatcher({ value }: { value: object }) {
  const { refresh } = useContext(VariableTreeContext);
  const structure = useStructure(value, true);
  const previous = useRef(structure);
  useEffect(() => {
    if (previous.current !== structure) {
      previous.current = structure;
      refresh();
    }
  }, [structure, refresh]);
  return null;
}

function LiveVariableValue({
  node, visible, expanded,
}: {
  node: VariableNode;
  visible: boolean;
  expanded: boolean;
}) {
  const { refresh } = useContext(VariableTreeContext);
  const current = useVariable(node.location, visible);
  const previousValue = useRef(current.value);
  const circular = current.expandable && node.ancestors.includes(current.value as object);

  useEffect(() => {
    const previous = previousValue.current;
    previousValue.current = current.value;
    if (visible && !Object.is(previous, current.value) &&
        (isReference(previous) || isReference(current.value))) {
      refresh();
    }
  }, [current.value, visible, refresh]);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {node.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap
          title={current.preview} sx={{ fontFamily: "monospace", maxWidth: "50%" }}>
          {current.preview}
        </Typography>
        {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
        {current.hidden && <Typography variant="caption" color="text.disabled">hidden</Typography>}
        {current.error && <Typography role="alert" variant="caption" color="error">{current.error}</Typography>}
      </Box>
      {expanded && visible && current.expandable && !circular &&
        <VisibleStructureWatcher value={current.value as object} />}
    </>
  );
}

/** MUI owns the tree and accessibility; these rows retain visibility-gated polling. */
export function LiveVariableTreeItem(props: TreeItemProps) {
  const node = useTreeItemModel<VariableTreeNode>(props.itemId);
  const { ref, inView } = useInView();
  const { expanded, loadMore } = useContext(VariableTreeContext);

  if (!node) return <TreeItem {...props} ref={ref} />;
  if (isLoadMore(node)) {
    return (
      <TreeItem {...props} ref={ref} disableSelection label={
        <Button size="small" onClick={(event) => {
          event.stopPropagation();
          loadMore(node.loadMore.parentId, node.loadMore.shown);
        }}>
          {node.name}
        </Button>
      } />
    );
  }
  return (
    <TreeItem {...props} ref={ref} disableSelection
      label={<LiveVariableValue node={node} visible={inView} expanded={expanded.has(node.id)} />} />
  );
}
