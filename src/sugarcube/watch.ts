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
  generation: number;
  targets: WatchTarget[];
}

export interface WatchResponse {
  generation: number;
  changes: WatchPatch[];
  /** Synchronous MAIN-world compare and clone time, excluding RPC latency. */
  mainDurationMs: number;
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

/**
 * Keep ancestors, discard their descendants. Collection iteration positions
 * are unstable: watch the containing Map/Set rather than an indexed entry.
 */
export function minimizeWatchTargets(targets: WatchTarget[]): WatchTarget[] {
  const normalized = targets.map((target) => {
    const collectionIndex = target.path.findIndex(
      (part) => part.type === "mapKey" || part.type === "mapValue" || part.type === "setValue",
    );
    return collectionIndex < 0 ? target : {
      scope: target.scope, path: target.path.slice(0, collectionIndex),
    };
  });
  const unique = [...new Map(normalized.map((target) => [watchKey(target), target])).values()];
  return unique.filter(
    (target) => !unique.some((other) => other !== target && isAncestor(other, target)),
  );
}
