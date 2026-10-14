import { Typography } from "antd";
import { useEffect } from "react";
import { isExpandableNode } from "../inspection/isExpandableNode";
import type { VariableLocation } from "../inspection/variableLocation";
import { getLocationName } from "../inspection/variableStructure";
import type { VariableNode } from "./variableNodes";
import { useVariable } from "./useVariableWatch";
import { MapKeyPreview, VariableValuePreview } from "./VariableValuePreview";

/** Virtualized rows own only visible-value subscriptions. */
export function VariableNodeContent({ node, refresh, isLeaf }: {
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
    if (isLeaf !== !isExpandableNode(node)) refresh(node.key);
  }, [current, isLeaf, node, refresh]);

  return <span className="flex w-full min-w-0 items-center gap-[8px]">
    {isMapEntry ? <>
      <span className="flex min-w-0 flex-1">
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} />
      </span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>→</Typography.Text>
      <VariableValuePreview current={current} />
    </> : <>
      {!isSetMember &&
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">
          {getLocationName(node.location)}
        </span>}
      {isSetMember && <span className="min-w-0 flex-1" />}
      <VariableValuePreview current={current} />
    </>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
  </span>;
}
