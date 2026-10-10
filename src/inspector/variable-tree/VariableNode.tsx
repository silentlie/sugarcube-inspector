import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import { memo, useEffect, useRef, useState } from "react";
import VariableTile from "./VariableTile";
import type { PathSegment, VariableAncestor, VariableScope } from "./types";
import { formatVariablePath, getChildren, isExpandable } from "./valueUtils";
import { useWatch } from "../watch/WatchProvider";
import { useVariableVersion } from "../watch/VariableStore";
import { pathToKey } from "../../sugarcube/path";
import type { VariablePath } from "../../sugarcube/watch";

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
  const [watchPath] = useState<VariablePath>(() => [{ type: "property", key: scope }, ...path]);
  useVariableVersion(watch.store, watchPath);
  const value = fromStore ? watch.store.getValue(watchPath) : initialValue;
  const id = pathToKey(watchPath);
  const circularAncestor = isNonFunctionObject(value)
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
    if (intersectsRef.current) setVisible(watchPath, !expandable || expanded);
  }, [watchPath, expandable, expanded, setVisible]);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const observe = (isIntersecting: boolean) => {
      intersectsRef.current = isIntersecting;
      setVisible(watchPath, isIntersecting && (!expandableRef.current ||
        expandedRef.current));
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
  }, [watchPath, setVisible]);

  const nextAncestors: readonly VariableAncestor[] =
    isNonFunctionObject(value)
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
            setVisible(watchPath, !expanded);
            if (!expanded) watch.pollNow();
            onToggle(id);
          }}
          favorite={watch.favorites.has(id)}
          onToggleFavorite={() => watch.toggleFavorite(watchPath, !watch.favorites.has(id))}
        />
      </div>

      {expanded && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          {getChildren(value).map((child) => (
            <VariableNode
              key={pathToKey([child.segment])}
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

// Poll updates use node-local subscriptions, not parent prop changes.
// Expansion state remains shared so nested expansion is retained on collapse.
export default memo(VariableNode);
