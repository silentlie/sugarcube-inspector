import { isObject } from "@sindresorhus/is";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { TreeItem, type TreeItemProps } from "@mui/x-tree-view/TreeItem";
import { useTreeItemModel } from "@mui/x-tree-view/hooks";
import { createContext, useContext, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableNode } from "../inspection/variableTree";
import { useStructure, useVariable } from "./useVariableWatch";
import { inlinePreview, typeToken, valueToken } from "./valueSyntax";

type TreeState = {
  expanded: ReadonlySet<string>;
  refresh: () => void;
};

export const VariableTreeContext = createContext<TreeState>({
  expanded: new Set(),
  refresh: () => {},
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
        (isObject(previous) || isObject(current.value))) {
      refresh();
    }
  }, [current.value, visible, refresh]);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {node.name}
        </Typography>
        <Typography component="span" variant="caption" noWrap
          className={`token ${typeToken(current.type)}`}
          sx={{ fontFamily: "monospace", flexShrink: 0 }}>
          {current.type}
        </Typography>
        <Typography component="span" variant="caption" noWrap
          className={`token ${valueToken(current.type)}`}
          title={current.preview} sx={{ fontFamily: "monospace", maxWidth: "45%" }}>
          {inlinePreview(current.type, current.preview)}
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
  const node = useTreeItemModel<VariableNode>(props.itemId);
  const { ref, inView } = useInView();
  const { expanded } = useContext(VariableTreeContext);

  if (!node) return <TreeItem {...props} ref={ref} />;
  return (
    <TreeItem {...props} ref={ref} disableSelection
      label={<LiveVariableValue node={node} visible={inView} expanded={expanded.has(node.id)} />} />
  );
}
