import { isObject } from "@sindresorhus/is";
import { Typography } from "antd";
import { Star } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { favoriteStore, sameFavoritePath } from "../favorites";
import { isLeafNode } from "../isLeafNode";
import { getLocationName, type VariableLocation } from "../location";
import type { VariableNode } from "../nodes";
import { useVariable } from "./useVariableWatch";
import { MapKeyPreview, VariableValuePreview } from "./VariableValuePreview";

/** Virtualized rows own only visible-value subscriptions. */
export function VariableNodeContent({ node, refresh }: {
  node: VariableNode; refresh: (id: number, load?: boolean) => void;
}) {
  const current = useVariable(node.location);
  const favoriteEntries = useSyncExternalStore(favoriteStore.subscribe, favoriteStore.getSnapshot);
  const path = node.favoritePath;
  const pinned = path !== undefined && favoriteEntries.some(({ location }) => sameFavoritePath(location, path));
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const isLeaf = isLeafNode(node, current);
  const circular = !isMapEntry && current.kind === "value" &&
    isObject(current.value) && isLeaf;

  // A collapsed row can become expandable (or a leaf) while visible.
  useEffect(() => {
    if (node.isLeaf !== isLeaf) refresh(node.key);
  }, [isLeaf, node.isLeaf, node.key, refresh]);

  return <span className="flex w-full min-w-0 items-center gap-2">
    {isMapEntry ? <>
      <span className="flex min-w-0 flex-1">
        <MapKeyPreview location={node.location as Extract<VariableLocation, {kind:"map"}>} />
      </span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>→</Typography.Text>
      <VariableValuePreview current={current} />
    </> : <>
      {!isSetMember &&
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {getLocationName(node.location)}
        </span>}
      {isSetMember && <span className="min-w-0 flex-1" />}
      <VariableValuePreview current={current} />
    </>}
    {path && path.path.length > 0 &&
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded p-1 text-neutral-400 hover:text-yellow-400"
        title={pinned ? "Remove from favorites" : "Add to favorites"}
        aria-label={(pinned ? "Remove " : "Add ") + getLocationName(node.location) + (pinned ? " from favorites" : " to favorites")}
        aria-pressed={pinned}
        onClick={(event) => {
          event.stopPropagation();
          favoriteStore.toggle(path);
        }}
      >
        <Star size={14} fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
      </button>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
  </span>;
}
