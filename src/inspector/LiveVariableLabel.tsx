import { isObject } from "@sindresorhus/is";
import { Typography } from "antd";
import { useEffect, useMemo, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { readVariable, type VariableLocation, type VariableSnapshot } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import type { VariableNode } from "../inspection/variableTree";
import { useStructure, useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";
import { benchmarkVariant, count } from "./benchmark/metrics";

function ValueTokens({ current, showType = true }: { current: VariableSnapshot; showType?: boolean }) {
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";
  const noPrism = benchmarkVariant() === "noPrism";
  return <>
    {showType && <span style={{
      fontFamily: "monospace", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {noPrism ? type : <TypeSyntax type={type} />}
    </span>}
    <span title={preview} style={{
      fontFamily: "monospace", fontSize: 12,
      maxWidth: showType ? "45%" : "100%", overflow: "hidden",
      textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {noPrism ? preview : <ValueSyntax type={type} preview={preview} />}
    </span>
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

/** Formatted snapshot-only row; no hooks or live row subscriptions. */
export function StaticVariableLabel({ node }: { node: VariableNode }) {
  const current = readVariable(node.location);
  return <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
      {getLocationName(node.location)}
    </span>
    <ValueTokens current={current} />
  </span>;
}

/** Only virtualized rows mount these hooks and live value subscriptions. */
export function LiveVariableLabel({ node, expanded, refresh, parentVisible }: {
  node: VariableNode; expanded: boolean; refresh: (id: string) => void;
  parentVisible: boolean;
}) {
  count("row.render");
  const noRowVisibility = benchmarkVariant() === "noRowVisibility";
  const { ref, inView } = useInView({ skip: noRowVisibility });
  const rowVisible = (noRowVisibility ? parentVisible : inView) &&
    benchmarkVariant() !== "noRowWatch";
  const current = useVariable(node.location, rowVisible);
  const value = current.kind === "value" ? current.value : undefined;
  const previousValueRef = useRef(value);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const circular = !isMapEntry && current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);

  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (rowVisible && !Object.is(previous, value) &&
        (isObject(previous) || isObject(value))) refresh(node.id);
  }, [value, rowVisible, node.id, refresh]);

  return <span ref={ref} style={{
    display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%",
  }}>
    {isMapEntry ? <>
      <span style={{ display: "flex", flex: 1, minWidth: 0 }}>
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} visible={rowVisible} />
      </span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>→</Typography.Text>
      <ValueTokens current={current} />
    </> : <>
      {!isSetMember &&
        <span style={{
          minWidth: 0, flex: 1, overflow: "hidden", whiteSpace: "nowrap",
          textOverflow: "ellipsis", fontSize: 14,
        }}>
          {getLocationName(node.location)}
        </span>}
      {isSetMember && <span style={{ flex: 1, minWidth: 0 }} />}
      <ValueTokens current={current} />
    </>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
    {expanded && rowVisible && !isMapEntry && current.kind === "value" &&
      current.expandable && !circular &&
      <ExpandedStructureWatcher value={current.value as object} onChange={() => refresh(node.id)} />}
  </span>;
}
