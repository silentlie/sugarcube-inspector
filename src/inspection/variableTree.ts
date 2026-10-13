import { isObject } from "@sindresorhus/is";
import type { VariableLocation } from "./variableLocation";
import { readVariable } from "./variableLocation";
import { listChildren } from "./variableStructure";

/** Tree nodes hold live locations, never copied values or child arrays. */
export type VariableNode = {
  id: number;
  location: VariableLocation;
  /** Ancestors prevent circular traversal when discovering a branch. */
  ancestors: readonly object[];
};

// Numeric IDs are unique across both scopes; 0 and 1 belong to their roots.
let nextNodeId = 2;

// Alias paths must differ, but a replaced live owner must not reuse a stale
// location. Weak keys allow unused parent nodes and owners to be collected.
const childIds = new WeakMap<
  VariableNode,
  WeakMap<object, Map<string, Map<unknown, number>>>
>();

function getChildId(parent: VariableNode, location: VariableLocation): number {
  if (location.kind === "state") throw new Error("State stores cannot be child nodes");

  let byOwner = childIds.get(parent);
  if (!byOwner) {
    byOwner = new WeakMap();
    childIds.set(parent, byOwner);
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

function childNode(parent: VariableNode, location: VariableLocation, ancestors: readonly object[]): VariableNode {
  return {
    id: getChildId(parent, location),
    location,
    ancestors,
  };
}

/** Discover only direct children when their branch is opened or refreshed. */
export function getVariableChildren(node: VariableNode): VariableNode[] {
  const location = node.location;
  if (location.kind === "map" && location.part === undefined) {
    if (!Map.prototype.has.call(location.owner, location.key)) return [];
    // Each entry opens two independently expandable children.
    return (["key", "value"] as const).map((part) =>
      childNode(node, { ...location, part }, node.ancestors));
  }

  const current = readVariable(location);
  if (current.kind !== "value" || !isObject(current.value) ||
      node.ancestors.includes(current.value)) return [];

  const nextAncestors = [...node.ancestors, current.value];
  return listChildren(current.value).map((child) => childNode(node, child, nextAncestors));
}
