import { isObject } from "@sindresorhus/is";
import type { TreeDataNode } from "antd";
import { isExpandableNode } from "../inspection/isExpandableNode";
import { readVariable, type VariableLocation } from "../inspection/variableLocation";
import { listChildren } from "../inspection/variableStructure";

/** One node model for both live inspection and Ant's treeData. */
export type VariableNode = TreeDataNode & {
  key: number;
  location: VariableLocation;
  /** Ancestors prevent circular traversal when discovering a branch. */
  ancestors: readonly object[];
  children?: VariableNode[];
  /** Value whose direct children were last loaded (identity, not a snapshot). */
  loadedValue?: unknown;
};

// Numeric IDs are unique across scopes; 0 and 1 are reserved for roots.
let nextNodeId = 2;

// Key by the retained location, not the VariableNode, since immutable tree updates
// replace item objects. A new live owner still gets distinct descendant IDs.
// Weak keys allow removed locations and their registries to be collected.
const childIds = new WeakMap<
  VariableLocation,
  WeakMap<object, Map<string, Map<unknown, number>>>
>();

function getChildId(parent: VariableNode, location: VariableLocation): number {
  if (location.kind === "state") throw new Error("State stores cannot be child nodes");

  let byOwner = childIds.get(parent.location);
  if (!byOwner) {
    byOwner = new WeakMap();
    childIds.set(parent.location, byOwner);
  }

  let byKind = byOwner.get(location.owner);
  if (!byKind) {
    byKind = new Map();
    byOwner.set(location.owner, byKind);
  }

  const kind = location.kind === "map" ? location.part ?? "map" : location.kind;
  let ids = byKind.get(kind);
  if (!ids) {
    ids = new Map();
    byKind.set(kind, ids);
  }

  const key = location.kind === "set" ? location.member : location.key;
  let id = ids.get(key);
  if (id === undefined) {
    id = nextNodeId++;
    ids.set(key, id);
  }
  return id;
}

function childItem(
  parent: VariableNode, location: VariableLocation, ancestors: readonly object[],
  existing?: ReadonlyMap<number, VariableNode>,
): VariableNode {
  const key = getChildId(parent, location);
  const old = existing?.get(key);
  if (old) {
    // Preserve the old location, ancestors and loaded descendants. Only make a
    // candidate copy when expandability has changed; reconciliation handles it.
    const isLeaf = !isExpandableNode(old);
    return old.isLeaf === isLeaf ? old : { ...old, isLeaf };
  }
  const item: VariableNode = { key, location, ancestors };
  item.isLeaf = !isExpandableNode(item);
  return item;
}

/** Discover direct live children without eagerly enumerating descendants. */
export function getVariableChildren(
  item: VariableNode, existing?: ReadonlyMap<number, VariableNode>,
): VariableNode[] {
  const location = item.location;
  if (location.kind === "map" && location.part === undefined) {
    if (!Map.prototype.has.call(location.owner, location.key)) return [];
    return (["key", "value"] as const).map((part) =>
      childItem(item, { ...location, part }, item.ancestors, existing));
  }

  const current = readVariable(location);
  if (current.kind !== "value" || !isObject(current.value) ||
      item.ancestors.includes(current.value)) return [];

  const nextAncestors = [...item.ancestors, current.value];
  return listChildren(current.value).map((child) => childItem(item, child, nextAncestors, existing));
}

function valueAt(item: VariableNode): unknown {
  const current = readVariable(item.location);
  return current.kind === "value" ? current.value : undefined;
}

/**
 * Reconcile only supplied siblings. Stable IDs keep existing VariableNodes;
 * previously loaded descendants are revisited only on owner replacement.
 */
export function reconcileChildren(
  nodes: VariableNode[], previous: VariableNode[] = [],
  existing?: ReadonlyMap<number, VariableNode>,
): VariableNode[] {
  const byId = existing ?? new Map(previous.map((item) => [item.key, item]));
  let changed = nodes.length !== previous.length;
  const next = nodes.map((node, index) => {
    const old = byId.get(node.key);
    if (!old) {
      changed = true;
      return node;
    }

    const isLeaf = node.isLeaf;
    if (old.isLeaf === isLeaf &&
        (old.children === undefined || (!isLeaf && Object.is(old.loadedValue, valueAt(node))))) {
      if (old !== previous[index]) changed = true;
      return old;
    }

    changed = true;
    if (isLeaf) return { ...old, isLeaf: true, children: undefined, loadedValue: undefined };
    if (old.children === undefined) return { ...old, isLeaf: false };

    // Retain the previous location reference so nested IDs remain stable.
    const children = reconcileLiveChildren(old, old.children);
    return { ...old, isLeaf: false, children, loadedValue: valueAt(old) };
  });
  return changed ? next : previous;
}

/** Reuse one ID lookup for both child creation and reconciliation. */
export function reconcileLiveChildren(
  parent: VariableNode, previous: VariableNode[] = [],
): VariableNode[] {
  const byId = new Map(previous.map((node) => [node.key, node]));
  return reconcileChildren(getVariableChildren(parent, byId), previous, byId);
}

/** Update only the path to a requested item; preserve unaffected sibling arrays. */
export function updateTreeItem(
  items: VariableNode[], target: number, update: (item: VariableNode) => VariableNode,
): VariableNode[] {
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

/** Refresh a node's direct children only if loaded or explicitly expanding. */
export function refreshItem(item: VariableNode, load = false): VariableNode {
  const isLeaf = !isExpandableNode(item);
  const children = isLeaf || (!load && item.children === undefined)
    ? undefined
    : reconcileLiveChildren(item, item.children);
  const loadedValue = children === undefined ? undefined : valueAt(item);

  if (item.isLeaf === isLeaf && item.children === children &&
      Object.is(item.loadedValue, loadedValue)) return item;
  return { ...item, isLeaf, children, loadedValue };
}
