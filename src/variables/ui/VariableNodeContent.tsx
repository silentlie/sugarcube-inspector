import { isObject } from "@sindresorhus/is";
import { Typography } from "antd";
import { useEffect } from "react";
import { isLeafNode } from "../isLeafNode";
import { getLocationName, type VariableLocation } from "../location";
import type { VariableNode } from "../nodes";
import { useVariable } from "./useVariableWatch";
import { MapKeyPreview, VariableTypePreview, VariableValuePreview } from "./VariableValuePreview";

/** Virtualized rows own only visible-value subscriptions. */
export function VariableNodeContent({ node, refresh, expanded, onToggle }: {
  node: VariableNode;
  refresh: (id: number, load?: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const current = useVariable(node.location);
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const isLeaf = isLeafNode(node, current);
  const circular = !isMapEntry && current.kind === "value" &&
    isObject(current.value) && isLeaf;

  // A collapsed row can become expandable (or a leaf) while visible.
  useEffect(() => {
    if (node.isLeaf !== isLeaf) refresh(node.key);
  }, [isLeaf, node.isLeaf, node.key, refresh]);

  return <span
    className={`flex w-full min-w-0 items-center gap-2 ${isLeaf ? "" : "cursor-pointer"}`}
    role={isLeaf ? undefined : "button"}
    tabIndex={isLeaf ? undefined : 0}
    aria-expanded={isLeaf ? undefined : expanded}
    onClick={isLeaf ? undefined : (event) => {
      event.stopPropagation();
      onToggle();
    }}
    onKeyDown={isLeaf ? undefined : (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    }}>
    {isMapEntry ? <>
      <span className="flex min-w-0 flex-1 items-baseline">
        <span className="min-w-0 truncate">
          <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} />
        </span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>&nbsp;→&nbsp;</Typography.Text>
        <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">
          <VariableTypePreview current={current} />
        </span>
      </span>
      <VariableValuePreview current={current} />
    </> : <>
      <span className="flex min-w-0 flex-1 items-baseline">
        {!isSetMember && <span className="min-w-0 truncate text-[14px]">
          {getLocationName(node.location)}
        </span>}
        <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">
          {!isSetMember && ": "}<VariableTypePreview current={current} />
        </span>
      </span>
      <VariableValuePreview current={current} />
    </>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
  </span>;
}
