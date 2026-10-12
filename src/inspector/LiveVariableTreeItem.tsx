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
  const value = current.kind === "value" ? current.value : undefined;
  const previousValue = useRef(value);
  const circular = current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";

  useEffect(() => {
    const previous = previousValue.current;
    previousValue.current = value;
    if (visible && !Object.is(previous, value) &&
        (isObject(previous) || isObject(value))) {
      refresh();
    }
  }, [value, visible, refresh]);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {node.name}
        </Typography>
        <Typography component="span" variant="caption" noWrap
          className={`token ${typeToken(type)}`}
          sx={{ fontFamily: "monospace", flexShrink: 0 }}>
          {type}
        </Typography>
        <Typography component="span" variant="caption" noWrap
          className={`token ${valueToken(type)}`}
          title={preview} sx={{ fontFamily: "monospace", maxWidth: "45%" }}>
          {inlinePreview(type, preview)}
        </Typography>
        {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
      </Box>
      {expanded && visible && current.kind === "value" && current.expandable && !circular &&
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
