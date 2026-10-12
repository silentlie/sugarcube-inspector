import { isObject } from "@sindresorhus/is";
import { getStore } from "./direct";
import type { VariableNode } from "./variableTree";

/** Check only this location, without type detection or enumerating descendants. */
export function isExpandableNode(node: VariableNode): boolean {
  const location = node.location;
  if (location.kind === "map" && location.part === undefined) {
    return Map.prototype.has.call(location.owner, location.key);
  }
  let value: unknown;
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
  return isObject(value) && !node.ancestors.includes(value);
}
