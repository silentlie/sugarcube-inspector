import { isObject } from "@sindresorhus/is";
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

/** MUI eagerly indexes the entire hierarchy, including collapsed nodes. */
export function getVariableChildren(node: VariableNode): VariableNode[] {
  const snapshot = readVariable(node.location);
  if (snapshot.kind !== "value" || !snapshot.expandable || !isObject(snapshot.value) ||
      node.ancestors.includes(snapshot.value)) return [];

  try {
    const nextAncestors = [...node.ancestors, snapshot.value];
    return listChildren(snapshot.value).map((child) => ({
      id: `${node.id}/${child.id}`,
      name: child.name,
      location: child.location,
      ancestors: nextAncestors,
    }));
  } catch {
    // An object may be a Proxy whose ownKeys trap throws. Do not crash MUI.
    return [];
  }
}
