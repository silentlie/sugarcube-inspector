import { isObject } from "@sindresorhus/is";
import { Tree, Typography, type TreeDataNode } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { type VariableStoreKey } from "../inspection/direct";
import type { VariableLocation } from "../inspection/variableLocation";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";
import { variableWatcher } from "../inspection/variableWatcher";
import { LiveVariableLabel } from "./LiveVariableLabel";
import { VariableScopeContext, useStructure, useVariable } from "./useVariableWatch";
import { reconcileChildren, refreshItem, updateTreeItem, type Item } from "./variableTreeItems";

function RichVariableTree({ storeKey, rootValue }: {
  storeKey: VariableStoreKey; rootValue: object;
}) {
  const structure = useStructure(rootValue);
  const rootNode = useMemo<VariableNode>(() => ({
    id: storeKey,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);
  const [items, setItems] = useState<Item[]>(() => reconcileChildren(getVariableChildren(rootNode)));
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
      if (active) setItems((old) => reconcileChildren(getVariableChildren(rootNode), old));
    });
    return () => { active = false; };
  }, [rootNode, rootValue, structure]);

  const refresh = useCallback((id: string, load = false) => {
    setItems((old) => updateTreeItem(old, id, (item) => refreshItem(item, load)));
  }, []);

  const loadData = useCallback((item: TreeDataNode): Promise<void> => {
    refresh(String(item.key), true);
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
      if (info.expanded && (info.node as Item).children) {
        refresh(String(info.node.key), true);
      }
    }}
    titleRender={(data) => {
      const item = data as Item;
      return <LiveVariableLabel
        node={item.variable} expanded={expanded.has(item.key)} refresh={refresh}
        isLeaf={Boolean(item.isLeaf)} loadedValue={item.loadedValue}
        childrenLoaded={item.children !== undefined} />;
    }}
  />}
  </div>;
}

function VariableTreeContent({ storeKey }: { storeKey: VariableStoreKey }) {
  const location = useMemo<VariableLocation>(() => ({ kind: "state", key: storeKey }), [storeKey]);
  const root = useVariable(location);
  return root.kind !== "value"
    ? <Typography.Text type="secondary">Store unavailable</Typography.Text>
    : isObject(root.value)
      ? <RichVariableTree storeKey={storeKey} rootValue={root.value} />
      : <Typography.Text type="secondary">{root.preview}</Typography.Text>;
}

export default function VariableTree({ storeKey }: { storeKey: VariableStoreKey }) {
  const { ref, inView } = useInView();
  useEffect(() => {
    variableWatcher.setScopeVisible(storeKey, inView);
    return () => variableWatcher.setScopeVisible(storeKey, false);
  }, [storeKey, inView]);

  return <div ref={ref} style={{
    display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
    overflow: "hidden",
  }}>
    <VariableScopeContext.Provider value={storeKey}>
      <VariableTreeContent storeKey={storeKey} />
    </VariableScopeContext.Provider>
  </div>;
}
