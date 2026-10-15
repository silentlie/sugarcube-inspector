import { isObject } from "@sindresorhus/is";
import { readLocation, type VariableLocation, type VariableRead } from "./variableLocation";

/** One leaf-classification rule. Visible rows can reuse a subscribed snapshot; reconciliation
 * reads the live value directly without preview/type formatting. */
export function isLeafNode(
  node: { location: VariableLocation; ancestors: readonly object[] },
  current: VariableRead = readLocation(node.location),
): boolean {
  if (current.kind !== "value") return true;
  if (node.location.kind === "map" && node.location.part === undefined) return false;
  return !isObject(current.value) || node.ancestors.includes(current.value);
}
