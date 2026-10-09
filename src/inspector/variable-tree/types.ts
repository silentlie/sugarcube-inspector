import type { PathSegment } from "../../sugarcube/watch";

export type { PathSegment, VariableScope } from "../../sugarcube/watch";

export interface VariableChild {
  name: string;
  value: unknown;
  segment: PathSegment;
}
