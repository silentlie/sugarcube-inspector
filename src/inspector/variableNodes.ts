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

type ChildLocation = Exclude<VariableLocation, { kind: "state" }>;

// 0 and 1 are reserved for root stores. IDs are assigned only to new children.
let nextNodeId = 2;

function childIdentity(location: ChildLocation): { kind: string; key: unknown } {
  return {
    kind: location.kind === "map" ? location.part ?? "map" : location.kind,
    key: location.kind === "set" ? location.member : location.key,
  };
}

/** Discover direct live locations without eagerly traversing descendants. */
function childLocations(item: VariableNode): {
  locations: ChildLocation[];
  ancestors: readonly object[];
} {
  const location = item.location;
  if (location.kind === "map" && location.part === undefined) {
    return {
      locations: Map.prototype.has.call(location.owner, location.key)
        ? [{ ...location, part: "key" }, { ...location, part: "value" }]
        : [],
      ancestors: item.ancestors,
    };
  }

  const current = readVariable(location);
  if (current.kind !== "value" || !isObject(current.value) ||
      item.ancestors.includes(current.value)) {
    return { locations: [], ancestors: item.ancestors };
  }

  return {
    locations: listChildren(current.value),
    ancestors: [...item.ancestors, current.value],
  };
}

function valueAt(item: VariableNode): unknown {
  const current = readVariable(item.location);
  return current.kind === "value" ? current.value : undefined;
}

/**
 * Reconcile direct children against their previous siblings.
 * IDs belong to retained nodes; removed children leave no registry behind.
 */
export function reconcileChildren(parent: VariableNode, previous: VariableNode[] = []): VariableNode[] {
  const { locations, ancestors } = childLocations(parent);
  const byKind = new Map<string, Map<unknown, VariableNode>>();
  for (const old of previous) {
    if (old.location.kind === "state") continue;
    const { kind, key } = childIdentity(old.location);
    let byKey = byKind.get(kind);
    if (!byKey) {
      byKey = new Map();
      byKind.set(kind, byKey);
    }
    byKey.set(key, old);
  }

  let changed = locations.length !== previous.length;
  const next = locations.map((location, index) => {
    const { kind, key } = childIdentity(location);
    const candidate = byKind.get(kind)?.get(key);
    const old = candidate && candidate.location.kind !== "state" &&
      candidate.location.owner === location.owner ? candidate : undefined;

    if (!old) {
      changed = true;
      const node: VariableNode = { key: nextNodeId++, location, ancestors };
      node.isLeaf = !isExpandableNode(node);
      return node;
    }

    const isLeaf = !isExpandableNode(old);
    if (old.isLeaf === isLeaf &&
        (old.children === undefined || (!isLeaf && Object.is(old.loadedValue, valueAt(old))))) {
      if (old !== previous[index]) changed = true;
      return old;
    }

    changed = true;
    if (isLeaf) return { ...old, isLeaf: true, children: undefined, loadedValue: undefined };
    if (old.children === undefined) return { ...old, isLeaf: false };

    const children = reconcileChildren(old, old.children);
    return { ...old, isLeaf: false, children, loadedValue: valueAt(old) };
  });
  return changed ? next : previous;
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
    : reconcileChildren(item, item.children);
  const loadedValue = children === undefined ? undefined : valueAt(item);

  if (item.isLeaf === isLeaf && item.children === children &&
      Object.is(item.loadedValue, loadedValue)) return item;
  return { ...item, isLeaf, children, loadedValue };
}
