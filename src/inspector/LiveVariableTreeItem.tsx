import { isObject } from "@sindresorhus/is";
import { hit } from "../inspection/performance.temp";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { TreeItem, type TreeItemProps } from "@mui/x-tree-view/TreeItem";
import { useTreeItemModel } from "@mui/x-tree-view/hooks";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableLocation, VariableSnapshot } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import type { VariableNode } from "../inspection/variableTree";
import { useStructure, useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";

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

function ValueTokens({ current, showType = true }: {
  current: VariableSnapshot;
  showType?: boolean;
}) {
  hit("ValueTokens");
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";

  return (
    <>
      {showType && (
        <Typography component="span" variant="caption" noWrap
          sx={{ fontFamily: "monospace", flexShrink: 0 }}>
          <TypeSyntax type={type} />
        </Typography>
      )}
      <Typography component="span" variant="caption" noWrap
        title={preview} sx={{ fontFamily: "monospace", maxWidth: showType ? "45%" : "100%" }}>
        <ValueSyntax type={type} preview={preview} />
      </Typography>
    </>
  );
}

function MapKeyPreview({ location, visible }: {
  location: Extract<VariableLocation, { kind: "map" }>;
  visible: boolean;
}) {
  const keyLocation = useMemo(() => ({ ...location, part: "key" as const }), [location]);
  const key = useVariable(keyLocation, visible);
  return <ValueTokens current={key} showType={false} />;
}

function LiveVariableValue({
  node, visible, expanded,
}: {
  node: VariableNode;
  visible: boolean;
  expanded: boolean;
}) {
  hit("LiveVariableValue");
  const { refresh } = useContext(VariableTreeContext);
  const current = useVariable(node.location, visible);
  const value = current.kind === "value" ? current.value : undefined;
  const previousValue = useRef(value);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const circular = !isMapEntry && current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);

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
        {isMapEntry ? (
          <>
            <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
              <MapKeyPreview location={node.location as Extract<VariableLocation, { kind: "map" }>} visible={visible} />
            </Box>
            <Typography variant="caption" color="text.secondary">→</Typography>
            <ValueTokens current={current} />
          </>
        ) : (
          <>
            {!isSetMember && (
              <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
                {getLocationName(node.location)}
              </Typography>
            )}
            {isSetMember && <Box sx={{ flex: 1, minWidth: 0 }} />}
            <ValueTokens current={current} />
          </>
        )}
        {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
      </Box>
      {expanded && visible && !isMapEntry && current.kind === "value" &&
        current.expandable && !circular &&
        <VisibleStructureWatcher value={current.value as object} />}
    </>
  );
}

/** MUI owns the tree and accessibility; these rows retain visibility-gated polling. */
export function LiveVariableTreeItem(props: TreeItemProps) {
  hit("LiveVariableTreeItem");
  const node = useTreeItemModel<VariableNode>(props.itemId);
  const { ref, inView } = useInView();
  const { expanded } = useContext(VariableTreeContext);

  if (!node) return <TreeItem {...props} ref={ref} />;
  return (
    <TreeItem {...props} ref={ref} disableSelection
      label={<LiveVariableValue node={node} visible={inView} expanded={expanded.has(node.id)} />} />
  );
}
