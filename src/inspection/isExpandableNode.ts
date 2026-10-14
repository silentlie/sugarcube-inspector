import { isObject } from "@sindresorhus/is";
import { readLocation, type VariableLocation, type VariableRead } from "./variableLocation";

/** One expandability rule. Visible rows can reuse a subscribed snapshot; reconciliation
 * reads the live value directly without preview/type formatting. */
export function isExpandableNode(
  node: { location: VariableLocation; ancestors: readonly object[] },
  current: VariableRead = readLocation(node.location),
): boolean {
  if (current.kind !== "value") return false;
  if (node.location.kind === "map" && node.location.part === undefined) return true;
  return isObject(current.value) && !node.ancestors.includes(current.value);
}
