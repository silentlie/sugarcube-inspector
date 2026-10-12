import { isObject } from "@sindresorhus/is";
import { Tree, Typography, type TreeDataNode } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { type VariableStoreKey } from "../inspection/direct";
import { isExpandableNode } from "../inspection/isExpandableNode";
import type { VariableLocation } from "../inspection/variableLocation";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";
import { getLocationName } from "../inspection/variableStructure";
import { LiveVariableLabel } from "./LiveVariableLabel";
import { useStructure, useVariable } from "./useVariableWatch";

type Item = TreeDataNode & {
  key: string;
  variable: VariableNode;
  children?: Item[];
};

/** Only expanded branches have child data; unexpanded locations stay lazy. */
function makeItem(variable: VariableNode, previous?: Item): Item {
  const expandable = isExpandableNode(variable);
  const children = expandable && previous?.children
    ? reconcile(getVariableChildren(variable), previous.children)
    : undefined;
  return {
    key: variable.id,
    title: getLocationName(variable.location),
    variable,
    isLeaf: !expandable,
    ...(children && { children }),
  };
}

function reconcile(nodes: VariableNode[], old: readonly Item[] = []): Item[] {
  const byId = new Map(old.map((node) => [node.key, node]));
  return nodes.map((node) => makeItem(node, byId.get(node.id)));
}

/** Share unchanged sibling arrays when replacing one subtree. */
function replaceChildren(items: Item[], target: string, children: Item[]): Item[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.key === target) {
      changed = true;
      return { ...item, isLeaf: children.length === 0, children };
    }
    if (!item.children) return item;
    const descendants = replaceChildren(item.children, target, children);
    if (descendants === item.children) return item;
    changed = true;
    return { ...item, children: descendants };
  });
  return changed ? next : items;
}

function RichVariableTree({ storeKey, rootValue, visible }: {
  storeKey: VariableStoreKey; rootValue: object; visible: boolean;
}) {
  const structure = useStructure(rootValue, visible);
  const rootNode = useMemo<VariableNode>(() => ({
    id: storeKey,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);
  const [items, setItems] = useState<Item[]>(() => reconcile(getVariableChildren(rootNode)));
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.floor(entry?.contentRect.height ?? 0);
      // Keep the last usable size while this tree's tab is hidden.
      if (measured > 0) setHeight((old) => old === measured ? old : measured);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);

  // Root structural mutations are the only reason to replace top-level items.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setItems((old) => reconcile(getVariableChildren(rootNode), old));
    });
    return () => { active = false; };
  }, [rootNode, rootValue, structure]);

  const refresh = useCallback((id: string) => {
    const find = (nodes: readonly Item[]): Item | undefined => {
      for (const node of nodes) {
        if (node.key === id) return node;
        if (node.children) {
          const child = find(node.children);
          if (child) return child;
        }
      }
      return undefined;
    };
    setItems((old) => {
      const item = find(old);
      if (!item) return old;
      const children = reconcile(getVariableChildren(item.variable), item.children);
      return replaceChildren(old, id, children);
    });
  }, []);

  const loadData = useCallback((item: TreeDataNode): Promise<void> => {
    refresh(String(item.key));
    return Promise.resolve();
  }, [refresh]);

  return <div ref={setViewport} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
    {height > 0 && <Tree
    aria-label={storeKey === "variables" ? "Story variables tree" : "Temporary variables tree"}
    className="sugarcube-variable-tree"
    blockNode
    selectable={false}
    switcherIcon={(props) => <span aria-hidden="true">{props.expanded ? "▾" : "▸"}</span>}
    virtual
    height={height}
    treeData={items}
    expandedKeys={expandedKeys}
    autoExpandParent={false}
    loadData={loadData}
    onExpand={(keys, info) => {
      setExpandedKeys(keys.map(String));
      // When reopening a loaded branch, refresh only that branch.
      if (info.expanded && (info.node as Item).children) {
        refresh(String(info.node.key));
      }
    }}
    titleRender={(data) => {
      const item = data as Item;
      return <LiveVariableLabel
        node={item.variable} expanded={expanded.has(item.key)} refresh={refresh} />;
    }}
  />}
  </div>;
}

export default function VariableTree({ storeKey }: {storeKey: VariableStoreKey}) {
  const { ref, inView: visible } = useInView();
  const location = useMemo<VariableLocation>(() => ({ kind: "state", key: storeKey }), [storeKey]);
  const root = useVariable(location, visible);
  return <div ref={ref} style={{
    display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
    overflow: "hidden",
  }}>
    {root.kind !== "value"
      ? <Typography.Text type="secondary">Store unavailable</Typography.Text>
      : isObject(root.value)
        ? <RichVariableTree storeKey={storeKey} rootValue={root.value} visible={visible} />
        : <Typography.Text type="secondary">{root.preview}</Typography.Text>}
  </div>;
}
