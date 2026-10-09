export type VariableScope = "story" | "temporary";

export type PathSegment =
  | { type: "property"; key: string }
  | { type: "index"; index: number }
  | { type: "mapKey"; index: number }
  | { type: "mapValue"; index: number }
  | { type: "setValue"; index: number };

export interface WatchTarget {
  scope: VariableScope;
  path: PathSegment[];
}

export type WatchPatch =
  | { op: "set"; scope: VariableScope; path: PathSegment[]; value: unknown }
  | { op: "delete"; scope: VariableScope; path: PathSegment[] };

export interface WatchRequest {
  session: string;
  revision: number;
  targets: WatchTarget[];
}

export interface WatchResponse {
  session: string;
  baseRevision: number;
  revision: number;
  patches: WatchPatch[];
}

export function watchKey(target: WatchTarget): string {
  return JSON.stringify([target.scope, target.path]);
}

function isAncestor(ancestor: WatchTarget, child: WatchTarget): boolean {
  if (ancestor.scope !== child.scope || ancestor.path.length > child.path.length) {
    return false;
  }

  return ancestor.path.every(
    (part, index) => JSON.stringify(part) === JSON.stringify(child.path[index]),
  );
}

/** Avoid diffing the same subtree several times. */
export function minimizeWatchTargets(targets: WatchTarget[]): WatchTarget[] {
  const unique = [...new Map(targets.map((target) => [watchKey(target), target])).values()];
  return unique.filter(
    (target) => !unique.some((other) => other !== target && isAncestor(other, target)),
  );
}
