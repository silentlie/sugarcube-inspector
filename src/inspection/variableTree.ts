import { isReference } from "./direct";
import type { VariableLocation } from "./variableLocation";
import { readVariable } from "./variableLocation";
import { listChildren } from "./variableStructure";

/** MUI's node model holds locations, never copied values or child arrays. */
export type VariableNode = {
  id: string;
  name: string;
  location: VariableLocation;
  /** Ancestors are needed to stop circular traversal during eager indexing. */
  ancestors: readonly object[];
};

export type LoadMoreNode = {
  id: string;
  name: string;
  loadMore: { parentId: string; shown: number; total: number };
};

export type VariableTreeNode = VariableNode | LoadMoreNode;

export const PAGE_SIZE = 100;

export function isLoadMore(node: VariableTreeNode): node is LoadMoreNode {
  return "loadMore" in node;
}

/** MUI calls this eagerly while indexing its hierarchy, including collapsed nodes. */
export function getVariableChildren(node: VariableNode, limit = PAGE_SIZE): VariableTreeNode[] {
  const snapshot = readVariable(node.location);
  if (!snapshot.expandable || !isReference(snapshot.value) ||
      node.ancestors.includes(snapshot.value)) return [];

  try {
    const children = listChildren(snapshot.value);
    const nextAncestors = [...node.ancestors, snapshot.value];
    const models: VariableTreeNode[] = children.slice(0, limit).map((child) => ({
      id: `${node.id}/${child.id}`,
      name: child.name,
      location: child.location,
      ancestors: nextAncestors,
    }));
    if (children.length > limit) {
      models.push({
        id: `${node.id}/#load-more`,
        name: `Load more (${limit}/${children.length})`,
        loadMore: { parentId: node.id, shown: limit, total: children.length },
      });
    }
    return models;
  } catch {
    // An object may be a Proxy whose ownKeys trap throws. Do not crash MUI.
    return [];
  }
}
