export type VariableScope = "story" | "temporary";

export type PathSegment =
  | { type: "property"; key: string }
  | { type: "mapKey"; index: number }
  | { type: "mapValue"; index: number }
  | { type: "setValue"; index: number };

/** The first property selects SugarCube's story or temporary variable store. */
export type VariablePath = [
  { type: "property"; key: VariableScope },
  ...PathSegment[],
];

export type WatchPatch =
  | { op: "set"; path: VariablePath; value: unknown }
  | { op: "delete"; path: VariablePath };

export interface WatchRequest {
  generation: number;
  favorites: VariablePath[];
  /** Includes the active-scope root for structure-only checking on every poll. */
  visible: VariablePath[];
}

export interface WatchResponse {
  generation: number;
  changes: WatchPatch[];
}
