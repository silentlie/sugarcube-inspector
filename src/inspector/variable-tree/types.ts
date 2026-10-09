export type VariableScope = "story" | "temporary";

export type PathSegment =
  | { type: "property"; key: string }
  | { type: "index"; index: number }
  | { type: "mapKey"; index: number }
  | { type: "mapValue"; index: number }
  | { type: "setValue"; index: number };

export interface VariableChild {
  name: string;
  value: unknown;
  segment: PathSegment;
}
