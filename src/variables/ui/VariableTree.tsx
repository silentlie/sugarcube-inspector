import { Tree, type TreeDataNode } from "antd";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type VariableStoreKey } from "../../sugarcube/state";
import { readLocation, type VariableLocation } from "../location";
import { variableWatcher } from "../watcher";
import { readStructure, sameStructure } from "../structure";
import { VariableNodeContent } from "./VariableNodeContent";
import { VariableScopeContext } from "./useVariableWatch";
import { reconcileChildren, refreshItem, updateTreeItem, type VariableNode } from "../nodes";

/** Snapshot both the current owner identity and its direct child structure. */
function readExpanded(node: VariableNode) {
  const current = readLocation(node.location);
  const value = current.kind === "value" ? current.value : undefined;
  return {
    value,
    // Map entry children are synthetic key/value slots, not properties of its value.
    structure: node.location.kind === "map" && node.location.part === undefined
      ? [] : readStructure(value),
  };
}

type ExpandedSnapshot = ReturnType<typeof readExpanded>;

function sameExpanded(a: ExpandedSnapshot, b: ExpandedSnapshot): boolean {
  return Object.is(a.value, b.value) && sameStructure(a.structure, b.structure);
}

type ExpandedWatch = { location: VariableLocation; unsubscribe: () => void };

function RichVariableTree({ storeKey }: { storeKey: VariableStoreKey }) {
  const rootNode = useMemo<VariableNode>(() => ({
    key: storeKey === "variables" ? 0 : 1,
    location: { kind: "state", key: storeKey },
    ancestors: [],
  }), [storeKey]);
  const [items, setItems] = useState<VariableNode[]>(() => reconcileChildren(rootNode));
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);
  const expandedWatchesRef = useRef(new Map<number, ExpandedWatch>());
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

  const refresh = useCallback((id: number, load = false) => {
    setItems((old) => updateTreeItem(old, id, (item) => refreshItem(item, load)));
  }, []);

  // Watch the root and expanded logical nodes, even when Ant virtualizes their rows.
  // Collapsing a parent pauses its descendants; the root always remains watched.
  useEffect(() => {
    const live = new Map<number, VariableNode>([[rootNode.key, rootNode]]);
    const collect = (siblings: readonly VariableNode[]) => {
      for (const item of siblings) {
        if (!expanded.has(item.key)) continue;
        live.set(item.key, item);
        if (item.children) collect(item.children);
      }
    };
    collect(items);

    const watches = expandedWatchesRef.current;
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
        unsubscribe: subscription.subscribe(() => {
          if (id === rootNode.key) {
            setItems((old) => reconcileChildren(rootNode, old));
          } else {
            refresh(id, true);
          }
        }),
      });
    }
  }, [items, expanded, refresh, rootNode, storeKey]);

  useEffect(() => {
    const watches = expandedWatchesRef.current;
    return () => {
      for (const watch of watches.values()) watch.unsubscribe();
      watches.clear();
    };
  }, []);

  const loadData = useCallback((item: TreeDataNode): Promise<void> => {
    refresh(item.key as number, true);
    return Promise.resolve();
  }, [refresh]);

  /** Clicking a title expands the same logical node as its chevron, including lazy children. */
  const toggleExpanded = useCallback((item: VariableNode) => {
    if (item.isLeaf) return;
    if (!expanded.has(item.key)) refresh(item.key, true);
    setExpandedKeys((old) => old.includes(item.key)
      ? old.filter((key) => key !== item.key)
      : [...old, item.key]);
  }, [expanded, refresh]);

  return <div ref={setViewport} className="min-h-0 flex-1 overflow-hidden">
    {height > 0 && <Tree
    aria-label={storeKey === "variables" ? "Story variables tree" : "Temporary variables tree"}
    className="sugarcube-variable-tree flex h-full flex-col"
    blockNode
    selectable={false}
    showLine={{ showLeafIcon: false }}
    switcherIcon={({ expanded }) => expanded
      ? <ChevronDown size={16} aria-hidden="true" />
      : <ChevronRight size={16} aria-hidden="true" />}
    virtual
    height={height}
    treeData={items}
    expandedKeys={expandedKeys}
    autoExpandParent={false}
    loadData={loadData}
    onExpand={(keys, info) => {
      setExpandedKeys(keys.filter((key): key is number => typeof key === "number"));
      if (info.expanded && (info.node as VariableNode).children) {
        refresh(info.node.key as number, true);
      }
    }}
    titleRender={(data) => {
      const item = data as VariableNode;
      return <VariableNodeContent
        node={item}
        refresh={refresh}
        expanded={expanded.has(item.key)}
        onToggle={() => toggleExpanded(item)}
      />;
    }}
  />}
  </div>;
}

export default function VariableTree({ storeKey, active }: {
  storeKey: VariableStoreKey; active: boolean;
}) {
  useEffect(() => {
    variableWatcher.setScopeActive(storeKey, active);
    return () => variableWatcher.setScopeActive(storeKey, false);
  }, [storeKey, active]);

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <VariableScopeContext value={storeKey}>
      <RichVariableTree storeKey={storeKey} />
    </VariableScopeContext>
  </div>;
}
