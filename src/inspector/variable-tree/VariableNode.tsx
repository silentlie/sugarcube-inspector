import { useEffect, useRef, useState } from "react";
import VariableTile from "./VariableTile";
import type { PathSegment, VariableScope } from "./types";
import { getChildren, isCircular, isExpandable } from "./valueUtils";
import { useOptionalWatch } from "../watch/WatchProvider";
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
  const watch = useOptionalWatch();
  const rowRef = useRef<HTMLDivElement>(null);
  const [target] = useState<WatchTarget>(() => ({ scope, path: [...path] }));
  const id = watchKey(target);

  const setVisible = watch?.setVisible;
  useEffect(() => {
    const element = rowRef.current;
    if (!setVisible || !element) return;

    const watched = target;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(watched, true);
      return () => setVisible(watched, false);
    }

    const observer = new IntersectionObserver(([entry]) => {
      setVisible(watched, entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      setVisible(watched, false);
    };
  }, [target, setVisible]);

  const circular = isCircular(value, ancestors);
  const expandable = !circular && isExpandable(value);
  const expanded = expandable && expandedPaths.has(id);
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
          onToggle={() => onToggle(id)}
          favorite={watch?.favorites.has(id) ?? false}
          onToggleFavorite={watch ? () => watch.toggleFavorite(target) : undefined}
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
