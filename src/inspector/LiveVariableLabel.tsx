import { isExpandableNode } from "../inspection/isExpandableNode";
import { Typography } from "antd";
import { useEffect, useMemo } from "react";
import type { VariableLocation, VariableSnapshot } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import type { VariableNode } from "../inspection/variableTree";
import { useVariable } from "./useVariableWatch";
import { TypeSyntax, ValueSyntax } from "./valueSyntax";

function ValueTokens({ current, showType = true }: { current: VariableSnapshot; showType?: boolean }) {
  const type = current.kind === "value" ? current.type :
    current.kind === "accessor" ? current.accessor : current.kind;
  const preview = current.kind === "value" ? current.preview :
    current.kind === "accessor" ? `[${current.accessor}]` : "[Missing]";
  return <>
    {showType && <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">
      <TypeSyntax type={type} />
    </span>}
    <span title={preview} className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] ${showType ? "max-w-[45%]" : "max-w-full"}`}>
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

/** Virtualized rows own only visible-value subscriptions. */
export function LiveVariableLabel({ node, refresh, isLeaf }: {
  node: VariableNode; refresh: (id: number, load?: boolean) => void;
  isLeaf: boolean;
}) {
  const current = useVariable(node.location);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const circular = !isMapEntry && current.kind === "value" && current.expandable &&
    node.ancestors.includes(current.value as object);

  // A collapsed row can become expandable (or a leaf) while visible.
  useEffect(() => {
    if (isLeaf !== !isExpandableNode(node)) refresh(node.id);
  }, [current, isLeaf, node, refresh]);

  return <span className="flex w-full min-w-0 items-center gap-[8px]">
    {isMapEntry ? <>
      <span className="flex min-w-0 flex-1">
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} />
      </span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>→</Typography.Text>
      <ValueTokens current={current} />
    </> : <>
      {!isSetMember &&
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">
          {getLocationName(node.location)}
        </span>}
      {isSetMember && <span className="min-w-0 flex-1" />}
      <ValueTokens current={current} />
    </>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
  </span>;
}
