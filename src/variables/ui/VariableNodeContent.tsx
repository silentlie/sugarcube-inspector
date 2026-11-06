import { isObject } from "@sindresorhus/is";
import { Typography } from "antd";
import { History, Star } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { favoriteStore, sameFavoritePath } from "../favorites";
import { isLeafNode } from "../isLeafNode";
import { getLocationName, type VariableLocation } from "../location";
import type { VariableNode } from "../nodes";
import { isEditablePrimitive, PrimitiveVariableEditor, type Primitive } from "./PrimitiveVariableEditor";
import { useVariable } from "./useVariableWatch";
import { MapKeyPreview, VariableTypePreview, VariableValuePreview } from "./VariableValuePreview";

/** Virtualized rows own only visible-value subscriptions. */
export function VariableNodeContent({ node, refresh, expanded, onToggle, onShowHistory, historyOpen }: {
  node: VariableNode;
  refresh: (id: number, load?: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
  onShowHistory?: (button: HTMLButtonElement) => void;
  historyOpen?: boolean;
}) {
  const current = useVariable(node.location);
  const favorites = useSyncExternalStore(favoriteStore.subscribe, favoriteStore.getSnapshot);
  const path = node.favoritePath;
  const pinned = path !== undefined && favorites.some(({ location }) => sameFavoritePath(path, location));
  const isMapEntry = node.location.kind === "map" && node.location.part === undefined;
  const isSetMember = node.location.kind === "set";
  const isLeaf = isLeafNode(node, current);
  const name = isMapEntry || isSetMember ? "" : getLocationName(node.location);
  const tileRef = useRef<HTMLSpanElement>(null);
  const [original, setOriginal] = useState<Primitive>();
  const location = node.location;
  const editableValue = isLeaf && path && location.kind === "property" &&
    current.kind === "value" && current.editable && isEditablePrimitive(current.value) &&
    path.path.length > 0 ? current.value : undefined;
  const activate = !isLeaf ? onToggle : editableValue !== undefined ? () => {
    if (original === undefined) setOriginal(editableValue);
  } : undefined;
  const circular = !isMapEntry && current.kind === "value" &&
    isObject(current.value) && isLeaf;

  // A collapsed row can become expandable (or a leaf) while visible.
  useEffect(() => {
    if (node.isLeaf !== isLeaf) refresh(node.key);
  }, [isLeaf, node.isLeaf, node.key, refresh]);

  return <div className="flex w-full min-w-0 items-center gap-2">
    <span
      ref={tileRef}
      className={`flex min-w-0 flex-1 items-center gap-2 ${activate ? "cursor-pointer" : ""}`}
      role={activate ? "button" : undefined}
      tabIndex={activate ? 0 : -1}
      aria-description={editableValue !== undefined ? "Edit value" : undefined}
      aria-expanded={isLeaf ? undefined : expanded}
      onClick={activate ? (event) => {
        event.stopPropagation();
        activate();
      } : undefined}
      onKeyDown={activate ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      } : undefined}>
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
            {name}
          </span>}
          <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">
            {!isSetMember && ": "}<VariableTypePreview current={current} />
          </span>
        </span>
        <VariableValuePreview current={current} />
      </>}
    </span>
    {original !== undefined && path && location.kind === "property" &&
      <PrimitiveVariableEditor name={name} path={path} location={location} original={original}
        close={() => {
          setOriginal(undefined);
          tileRef.current?.focus();
        }} />}
    {onShowHistory && <button type="button" className="shrink-0 cursor-pointer rounded p-1"
      aria-label={`Show change history for ${name}`} title="Show change history"
      aria-expanded={historyOpen} aria-controls={historyOpen ? "sugarcube-favorite-history" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onShowHistory(event.currentTarget);
      }}
      onKeyDown={(event) => event.stopPropagation()}>
      <History size={14} aria-hidden="true" />
    </button>}
    {path && path.path.length > 0 && <button
      type="button"
      className="shrink-0 cursor-pointer rounded p-1"
      aria-label={`${pinned ? "Remove" : "Add"} ${name} ${pinned ? "from" : "to"} favorites`}
      title={pinned ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={pinned}
      onClick={(event) => {
        event.stopPropagation();
        favoriteStore.toggle(path);
      }}
      onKeyDown={(event) => event.stopPropagation()}
    ><Star size={14} fill={pinned ? "currentColor" : "none"} aria-hidden="true" /></button>}
    {circular &&
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        same reference
      </Typography.Text>}
  </div>;
}
