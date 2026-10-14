import { isObject } from "@sindresorhus/is";
import { Tree, Typography, type TreeDataNode } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { type VariableStoreKey } from "../inspection/direct";
import { readVariable, type VariableLocation } from "../inspection/variableLocation";
import { variableWatcher } from "../inspection/variableWatcher";
import { readStructure, sameStructure } from "../inspection/variableStructure";
import { VariableNodeContent } from "./VariableNodeContent";
import { VariableScopeContext, useStructure, useVariable } from "./useVariableWatch";
import { getVariableChildren, reconcileChildren, refreshItem, updateTreeItem, type TreeItem } from "./variableTreeItems";

/** Snapshot both the current owner identity and its direct child structure. */
function readExpanded(node: TreeItem) {
  const current = readVariable(node.location);
  const value = current.kind === "value" ? current.value : undefined;
  return {
    value,
    // Map entry children are synthetic key/value slots, not properties of its value.
    structure: node.location.kind === "map" && node.location.part === undefined
      ? [] : readStructure(value),
  };
}

function sameExpanded(a: ReturnType<typeof readExpanded>, b: ReturnType<typeof readExpanded>): boolean {
  return Object.is(a.value, b.value) && sameStructure(a.structure, b.structure);
}

type ExpandedWatch = { location: VariableLocation; unsubscribe: () => void };

function RichVariableTree({ storeKey, rootValue }: {
  storeKey: VariableStoreKey; rootValue: object;
}) {
  const structure = useStructure(rootValue);
  const rootNode = useMemo<TreeItem>(() => ({
    key: storeKey === "variables" ? 0 : 1,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);
  const [items, setItems] = useState<TreeItem[]>(() => reconcileChildren(getVariableChildren(rootNode)));
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);
  const expandedWatches = useRef(new Map<number, ExpandedWatch>());
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

  const refresh = useCallback((id: number, load = false) => {
    setItems((old) => updateTreeItem(old, id, (item) => refreshItem(item, load)));
  }, []);

  // Expanded logical nodes keep polling even when Ant virtualizes their rows.
  // Collapsing a parent also pauses descendants retained in expandedKeys.
  useEffect(() => {
    const live = new Map<number, TreeItem>();
    const collect = (siblings: readonly TreeItem[]) => {
      for (const item of siblings) {
        if (!expanded.has(item.key)) continue;
        live.set(item.key, item);
        if (item.children) collect(item.children);
      }
    };
    collect(items);

    const watches = expandedWatches.current;
    for (const [id, watch] of watches) {
      if (live.get(id)?.location === watch.location) continue;
      watch.unsubscribe();
      watches.delete(id);
    }
    for (const [id, node] of live) {
      if (watches.has(id)) continue;
      const subscription = variableWatcher.watch(
        () => readExpanded(node), sameExpanded, storeKey,
      );
      watches.set(id, {
        location: node.location,
        unsubscribe: subscription.subscribe(() => refresh(id, true)),
      });
    }
  }, [items, expanded, refresh, storeKey]);

  useEffect(() => {
    const watches = expandedWatches.current;
    return () => {
      for (const watch of watches.values()) watch.unsubscribe();
      watches.clear();
    };
  }, []);

  const loadData = useCallback((item: TreeDataNode): Promise<void> => {
    refresh(item.key as number, true);
    return Promise.resolve();
  }, [refresh]);

  return <div ref={setViewport} className="min-h-0 flex-1 overflow-hidden">
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
      setExpandedKeys(keys.filter((key): key is number => typeof key === "number"));
      if (info.expanded && (info.node as TreeItem).children) {
        refresh(info.node.key as number, true);
      }
    }}
    titleRender={(data) => {
      const item = data as TreeItem;
      return <VariableNodeContent
        node={item} refresh={refresh} isLeaf={Boolean(item.isLeaf)} />;
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

  return <div ref={ref} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <VariableScopeContext.Provider value={storeKey}>
      <VariableTreeContent storeKey={storeKey} />
    </VariableScopeContext.Provider>
  </div>;
}
