import { useEffect, useRef, useState } from "react";
import VariableTile from "./VariableTile";
import type { PathSegment, VariableScope } from "./types";
import { getChildren, isCircular, isExpandable } from "./valueUtils";
import { useWatch } from "../watch/WatchProvider";
import { watchKey, type WatchTarget } from "../../sugarcube/watch";

interface VariableNodeProps {
  name: string;
  value: unknown;
  scope: VariableScope;
  path: readonly PathSegment[];
  expandedPaths: ReadonlySet<string>;
  onToggle: (id: string) => void;
  ancestors?: readonly object[];
}

export default function VariableNode({
  name,
  value,
  scope,
  path,
  expandedPaths,
  onToggle,
  ancestors = [],
}: VariableNodeProps) {
  const watch = useWatch();
  const rowRef = useRef<HTMLDivElement>(null);
  const [target] = useState<WatchTarget>(() => ({ scope, path: [...path] }));
  const id = watchKey(target);
  const circular = isCircular(value, ancestors);
  const expandable = !circular && isExpandable(value);
  const expanded = expandable && expandedPaths.has(id);
  const expandedRef = useRef(expanded);
  const expandableRef = useRef(expandable);
  const intersectsRef = useRef(false);
  const setVisible = watch.setVisible;

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

  const nextAncestors =
    value !== null && typeof value === "object"
      ? [...ancestors, value]
      : ancestors;

  return (
    <div>
      <div ref={rowRef}>
        <VariableTile
          name={name}
          value={value}
          circular={circular}
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
              scope={scope}
              path={[...path, child.segment]}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              ancestors={nextAncestors}
            />
          ))}
        </div>
      )}
    </div>
  );
}
