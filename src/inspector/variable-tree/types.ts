import type { PathSegment } from "../../sugarcube/watch/types";

export type { PathSegment, VariableScope } from "../../sugarcube/watch/types";

export interface VariableChild {
  name: string;
  value: unknown;
  segment: PathSegment;
}

/** Identity and path of a visible ancestor in the current variable tree. */
export interface VariableAncestor {
  value: object;
  path: readonly PathSegment[];
}
