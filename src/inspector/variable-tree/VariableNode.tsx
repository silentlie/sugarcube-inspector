import { memo, useEffect, useRef, useState } from "react";
import VariableTile from "./VariableTile";
import type { PathSegment, VariableAncestor, VariableScope } from "./types";
import { formatVariablePath, getChildren, isExpandable } from "./valueUtils";
import { useWatch } from "../watch/WatchProvider";
import { useVariableVersion } from "../watch/VariableStore";
import { watchKey, type WatchTarget } from "../../sugarcube/watch";

interface VariableNodeProps {
  name: string;
  value: unknown;
  fromStore?: boolean;
  scope: VariableScope;
  path: readonly PathSegment[];
  expandedPaths: ReadonlySet<string>;
  onToggle: (id: string) => void;
  ancestors?: readonly VariableAncestor[];
  onNavigate: (path: readonly PathSegment[]) => void;
  registerNode: (id: string, element: HTMLDivElement | null) => void;
}

function VariableNode({
  name,
  value: initialValue,
  fromStore = false,
  scope,
  path,
  expandedPaths,
  onToggle,
  ancestors = [],
  onNavigate,
  registerNode,
}: VariableNodeProps) {
  const watch = useWatch();
  const rowRef = useRef<HTMLDivElement>(null);
  const [target] = useState<WatchTarget>(() => ({ scope, path: [...path] }));
  useVariableVersion(watch.store, target);
  const value = fromStore ? watch.store.getValue(target) : initialValue;
  const id = watchKey(target);
  const circularAncestor = value !== null && typeof value === "object"
    ? ancestors.find((ancestor) => ancestor.value === value)
    : undefined;
  const circular = circularAncestor !== undefined;
  const expandable = !circular && isExpandable(value);
  const expanded = expandable && expandedPaths.has(id);
  const expandedRef = useRef(expanded);
  const expandableRef = useRef(expandable);
  const intersectsRef = useRef(false);
  const setVisible = watch.setVisible;

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;
    registerNode(id, element);
    return () => registerNode(id, null);
  }, [id, registerNode]);

  // Collapsed containers are not active watches. A visible primitive or an
  // expanded visible container is; favorites are registered separately.
  useEffect(() => {
    expandedRef.current = expanded;
    expandableRef.current = expandable;
    if (intersectsRef.current) setVisible(target, !expandable || expanded, expanded);
  }, [target, expandable, expanded, setVisible]);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observe = (isIntersecting: boolean) => {
      intersectsRef.current = isIntersecting;
      setVisible(target, isIntersecting && (!expandableRef.current ||
        expandedRef.current), expandedRef.current);
    };
    if (typeof IntersectionObserver === "undefined") {
      observe(true);
      return () => observe(false);
    }

    const observer = new IntersectionObserver(([entry]) => {
      observe(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      observe(false);
    };
  }, [target, setVisible]);

  const nextAncestors: readonly VariableAncestor[] =
    value !== null && typeof value === "object"
      ? [...ancestors, { value, path }]
      : ancestors;

  return (
    <div>
      <div ref={rowRef} tabIndex={-1}
        className="scroll-mt-5 rounded focus:outline-2 focus:outline-sky-400">
        <VariableTile
          name={name}
          value={value}
          circular={circular}
          circularTarget={circularAncestor
            ? formatVariablePath(scope, circularAncestor.path)
            : undefined}
          onNavigateCircular={circularAncestor
            ? () => onNavigate(circularAncestor.path)
            : undefined}
          expandable={expandable}
          expanded={expanded}
          onToggle={() => {
            // A click proves visibility even before IntersectionObserver
            // reports it. Expansion starts watching and polls immediately.
            intersectsRef.current = true;
            setVisible(target, !expanded, !expanded);
            onToggle(id);
          }}
          favorite={watch.favorites.has(id)}
          onToggleFavorite={() => watch.toggleFavorite(target, !watch.favorites.has(id))}
        />
      </div>

      {expanded && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          {getChildren(value).map((child) => (
            <VariableNode
              key={JSON.stringify(child.segment)}
              name={child.name}
              value={child.value}
              fromStore={fromStore}
              scope={scope}
              path={[...path, child.segment]}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              ancestors={nextAncestors}
              onNavigate={onNavigate}
              registerNode={registerNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Parent structural changes must not rerender unchanged child tiles.
// Node-local store subscriptions handle value changes, while the explicit
// ancestor comparison handles reference replacements affecting cycle links.
function sameNodeProps(a: VariableNodeProps, b: VariableNodeProps): boolean {
  const aKey = watchKey({ scope: a.scope, path: [...a.path] });
  const bKey = watchKey({ scope: b.scope, path: [...b.path] });
  return aKey === bKey && a.name === b.name &&
    a.fromStore === b.fromStore &&
    (a.fromStore || Object.is(a.value, b.value)) &&
    a.expandedPaths.has(aKey) === b.expandedPaths.has(bKey) &&
    a.onToggle === b.onToggle && a.onNavigate === b.onNavigate &&
    a.registerNode === b.registerNode &&
    (a.ancestors?.length ?? 0) === (b.ancestors?.length ?? 0) &&
    (a.ancestors ?? []).every((ancestor, index) =>
      ancestor.value === b.ancestors?.[index]?.value);
}

export default memo(VariableNode, sameNodeProps);
