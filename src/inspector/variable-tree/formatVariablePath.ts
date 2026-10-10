import type { PathSegment, VariableScope } from "./types";

/** Display a concrete tree path for circular-reference navigation. */
export function formatVariablePath(
  scope: VariableScope,
  path: readonly PathSegment[],
): string {
  const prefix = scope === "story" ? "$" : "_";
  return prefix + path.map((part, i) => {
    if (part.type === "property") {
      if (/^[A-Za-z_$][\w$]*$/.test(part.key)) {
        return (i === 0 ? "" : ".") + part.key;
      }
      return `[${JSON.stringify(part.key)}]`;
    }
    if (part.type === "setValue") return `[${part.index}]`;
    return `[${part.index}].${part.type === "mapKey" ? "key" : "value"}`;
  }).join("");
}
