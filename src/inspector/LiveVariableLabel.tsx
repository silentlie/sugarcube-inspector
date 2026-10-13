import { isObject } from "@sindresorhus/is";
import { isExpandableNode } from "../inspection/isExpandableNode";
import { Typography } from "antd";
import { useEffect, useMemo, useRef } from "react";
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
    {showType && <span style={{
      fontFamily: "monospace", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap",
    }}>
      <TypeSyntax type={type} />
    </span>}
    <span title={preview} style={{
      fontFamily: "monospace", fontSize: 12,
      maxWidth: showType ? "45%" : "100%", overflow: "hidden",
      textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      <ValueSyntax type={type} preview={preview} />
    </span>
  </>;
}

function MapKeyPreview({ location }: {
  location: Extract<VariableLocation, {kind:"map"}>;
}) {
  const keyLocation = useMemo(() => ({ ...location, part: "key" as const }), [location]);
  const key = useVariable(keyLocation);
  return <ValueTokens current={key} showType={false} />;
}

function ExpandedStructureWatcher({ value, onChange }: {
  value: object; onChange: () => void;
}) {
  const structure = useStructure(value);
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
export function LiveVariableLabel({ node, expanded, refresh, isLeaf, loadedValue, childrenLoaded }: {
  node: VariableNode; expanded: boolean; refresh: (id: string, load?: boolean) => void;
  isLeaf: boolean; loadedValue: unknown; childrenLoaded: boolean;
}) {
  const current = useVariable(node.location);
  const value = current.kind === "value" ? current.value : undefined;
  const previousValueRef = useRef(value);
  const mountedRef = useRef(false);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const circular = !isMapEntry && current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);

  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    const firstRender = !mountedRef.current;
    mountedRef.current = true;
    // An expanded virtual row can remount after in-place structural mutations
    // that weren't polled while it was offscreen.
    const changedObject = !Object.is(previous, value) &&
      (isObject(previous) || isObject(value));
    const staleChildren = expanded && (!childrenLoaded || !Object.is(loadedValue, value));
    if ((firstRender && expanded) || changedObject || staleChildren ||
        isLeaf !== !isExpandableNode(node)) {
      refresh(node.id, expanded);
    }
  }, [value, expanded, loadedValue, childrenLoaded, isLeaf, node, refresh]);

  return <span style={{
    display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%",
  }}>
    {isMapEntry ? <>
      <span style={{ display: "flex", flex: 1, minWidth: 0 }}>
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} />
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
    {expanded && !isMapEntry && current.kind === "value" &&
      current.expandable && !circular &&
      <ExpandedStructureWatcher value={current.value as object} onChange={() => refresh(node.id)} />}
  </span>;
}
