import type { TreeDataNode } from "antd";
import { isExpandableNode } from "../inspection/isExpandableNode";
import { readVariable } from "../inspection/variableLocation";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";

/** Rendering labels come from live locations, not cached tree titles. */
export type TreeItem = TreeDataNode & {
  key: number;
  variable: VariableNode;
  children?: TreeItem[];
  /** Value whose direct children were last loaded (identity, not a snapshot). */
  loadedValue?: unknown;
};

function valueAt(node: VariableNode): unknown {
  const current = readVariable(node.location);
  return current.kind === "value" ? current.value : undefined;
}

/**
 * Reconcile only the supplied sibling list. An unchanged ID keeps its TreeItem and
 * location reference; a newly discovered ID never loads descendants.
 * Previously loaded descendants are revisited only if their owner value changed.
 */
export function reconcileChildren(nodes: VariableNode[], previous: TreeItem[] = []): TreeItem[] {
  const byId = new Map(previous.map((item) => [item.key, item]));
  let changed = nodes.length !== previous.length;
  const next = nodes.map((node, index) => {
    const old = byId.get(node.id);
    if (!old) {
      changed = true;
      return { key: node.id, variable: node, isLeaf: !isExpandableNode(node) };
    }

    const isLeaf = !isExpandableNode(node);
    if (old.isLeaf === isLeaf &&
        (old.children === undefined || (!isLeaf && Object.is(old.loadedValue, valueAt(node))))) {
      if (old !== previous[index]) changed = true;
      return old;
    }

    changed = true;
    if (isLeaf) return { ...old, isLeaf: true, children: undefined, loadedValue: undefined };
    if (old.children === undefined) return { ...old, isLeaf: false };

    // Same property ID, but a different referenced object. Update its loaded
    // direct children without traversing unaffected expanded siblings.
    const children = reconcileChildren(getVariableChildren(old.variable), old.children);
    return { ...old, isLeaf: false, children, loadedValue: valueAt(old.variable) };
  });
  return changed ? next : previous;
}

/** Update only the path to the requested item; retain all unaffected sibling arrays. */
export function updateTreeItem(
  items: TreeItem[], target: number, update: (item: TreeItem) => TreeItem,
): TreeItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.key === target) {
      const updated = update(item);
      if (updated !== item) changed = true;
      return updated;
    }
    if (item.children === undefined) return item;
    const children = updateTreeItem(item.children, target, update);
    if (children === item.children) return item;
    changed = true;
    return { ...item, children };
  });
  return changed ? next : items;
}

/** Refresh a node's direct child list only when it was already loaded or is expanding. */
export function refreshItem(item: TreeItem, load = false): TreeItem {
  const isLeaf = !isExpandableNode(item.variable);
  const children = isLeaf || (!load && item.children === undefined)
    ? undefined
    : reconcileChildren(getVariableChildren(item.variable), item.children);
  const loadedValue = children === undefined ? undefined : valueAt(item.variable);

  if (item.isLeaf === isLeaf && item.children === children &&
      Object.is(item.loadedValue, loadedValue)) return item;
  return { ...item, isLeaf, children, loadedValue };
}
