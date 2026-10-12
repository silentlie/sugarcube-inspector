import { isObject } from "@sindresorhus/is";
import type { VariableLocation } from "./variableLocation";
import { readVariable } from "./variableLocation";
import { getLocationId, listChildren } from "./variableStructure";

/** MUI's node model holds live locations, never copied values or child arrays. */
export type VariableNode = {
  id: string;
  location: VariableLocation;
  /** Ancestors stop circular traversal during eager indexing. */
  ancestors: readonly object[];
};

function childNode(parent: VariableNode, location: VariableLocation, ancestors: readonly object[]): VariableNode {
  return {
    id: `${parent.id}/${getLocationId(location)}`,
    location,
    ancestors,
  };
}

/** MUI eagerly indexes the entire hierarchy, including collapsed nodes. */
export function getVariableChildren(node: VariableNode): VariableNode[] {
  const location = node.location;
  if (location.kind === "map" && location.part === undefined) {
    if (!Map.prototype.has.call(location.owner, location.key)) return [];
    // Each entry opens two independently expandable children.
    return (["key", "value"] as const).map((part) =>
      childNode(node, { ...location, part }, node.ancestors));
  }

  const current = readVariable(location);
  if (current.kind !== "value" || !current.expandable || !isObject(current.value) ||
      node.ancestors.includes(current.value)) return [];

  const nextAncestors = [...node.ancestors, current.value];
  return listChildren(current.value).map((child) => childNode(node, child, nextAncestors));
}
