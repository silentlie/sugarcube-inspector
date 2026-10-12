import { isObject } from "@sindresorhus/is";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef } from "react";
import { useInView } from "react-intersection-observer";
import type { VariableLocation, VariableSnapshot } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import type { VariableNode } from "../inspection/variableTree";
import { useStructure, useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";

function ValueTokens({ current, showType = true }: { current: VariableSnapshot; showType?: boolean }) {
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";
  return <>
    {showType && <Typography component="span" variant="caption" noWrap
      sx={{ fontFamily: "monospace", flexShrink: 0 }}>
      <TypeSyntax type={type} />
    </Typography>}
    <Typography component="span" variant="caption" noWrap title={preview}
      sx={{ fontFamily: "monospace", maxWidth: showType ? "45%" : "100%" }}>
      <ValueSyntax type={type} preview={preview} />
    </Typography>
  </>;
}

function MapKeyPreview({ location, visible }: {
  location: Extract<VariableLocation, {kind:"map"}>; visible: boolean;
}) {
  const keyLocation = useMemo(() => ({ ...location, part: "key" as const }), [location]);
  const key = useVariable(keyLocation, visible);
  return <ValueTokens current={key} showType={false} />;
}

function ExpandedStructureWatcher({ value, onChange }: {
  value: object; onChange: () => void;
}) {
  const structure = useStructure(value, true);
  const previousRef = useRef(structure);
  useEffect(() => {
    if (structure !== previousRef.current) {
      previousRef.current = structure;
      onChange();
    }
  }, [structure, onChange]);
  return null;
}

/** Only virtualized rows mount these hooks and live value subscriptions. */
export function LiveVariableLabel({ node, expanded, refresh }: {
  node: VariableNode; expanded: boolean; refresh: (id: string) => void;
}) {
  const { ref, inView } = useInView();
  const current = useVariable(node.location, inView);
  const value = current.kind === "value" ? current.value : undefined;
  const previousValueRef = useRef(value);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const circular = !isMapEntry && current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);

  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (inView && !Object.is(previous, value) &&
        (isObject(previous) || isObject(value))) refresh(node.id);
  }, [value, inView, node.id, refresh]);

  return <span ref={ref} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%" }}>
    {isMapEntry ? <>
      <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} visible={inView} />
      </Box>
      <Typography variant="caption" color="text.secondary">→</Typography>
      <ValueTokens current={current} />
    </> : <>
      {!isSetMember &&
        <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {getLocationName(node.location)}
        </Typography>}
      {isSetMember && <Box sx={{ flex: 1, minWidth: 0 }} />}
      <ValueTokens current={current} />
    </>}
    {circular && <Typography variant="caption" color="info.main">same reference</Typography>}
    {expanded && inView && !isMapEntry && current.kind === "value" &&
      current.expandable && !circular &&
      <ExpandedStructureWatcher value={current.value as object} onChange={() => refresh(node.id)} />}
  </span>;
}
