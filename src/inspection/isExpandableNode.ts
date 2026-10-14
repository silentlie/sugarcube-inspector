import { isObject } from "@sindresorhus/is";
import { getStore } from "./direct";
import type { VariableLocation, VariableSnapshot } from "./variableLocation";

/** One expandability rule. Visible rows can reuse a subscribed snapshot; reconciliation
 * reads the live value directly without preview/type formatting. */
export function isExpandableNode(
  node: { location: VariableLocation; ancestors: readonly object[] },
  current?: VariableSnapshot,
): boolean {
  const location = node.location;
  if (location.kind === "map" && location.part === undefined) {
    return current ? current.kind === "value" : Map.prototype.has.call(location.owner, location.key);
  }

  let value: unknown;
  if (current) {
    if (current.kind !== "value") return false;
    value = current.value;
  } else {
    switch (location.kind) {
      case "state":
        value = getStore(location.key);
        break;
      case "property": {
        const descriptor = Object.getOwnPropertyDescriptor(location.owner, location.key);
        if (!descriptor || !("value" in descriptor)) return false;
        value = descriptor.value;
        break;
      }
      case "map":
        if (!Map.prototype.has.call(location.owner, location.key)) return false;
        value = location.part === "key"
          ? location.key : Map.prototype.get.call(location.owner, location.key);
        break;
      case "set":
        if (!Set.prototype.has.call(location.owner, location.member)) return false;
        value = location.member;
        break;
    }
  }

  return isObject(value) && !node.ancestors.includes(value);
}
