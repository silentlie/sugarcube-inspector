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

  const setExpanded = watch.setExpanded;
  useEffect(() => {
    expandedRef.current = expanded;
    setExpanded(target, expanded);
  }, [target, expanded, setExpanded]);

  const setVisible = watch.setVisible;
  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const watched = target;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(watched, true, expandedRef.current);
      return () => setVisible(watched, false);
    }

    const observer = new IntersectionObserver(([entry]) => {
      setVisible(watched, entry?.isIntersecting ?? false, expandedRef.current);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      setVisible(watched, false);
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
            // A clicked row is visible even if IntersectionObserver has not
            // delivered its first notification yet.
            if (!expanded) setVisible(target, true, true);
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
