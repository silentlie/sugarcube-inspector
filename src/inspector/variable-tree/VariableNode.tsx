import VariableTile from "./VariableTile";
import type { PathSegment, VariableScope } from "./types";
import { getChildren, isCircular, isExpandable } from "./valueUtils";

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
  const id = JSON.stringify([scope, path]);
  const circular = isCircular(value, ancestors);
  const expandable = !circular && isExpandable(value);
  const expanded = expandable && expandedPaths.has(id);

  const nextAncestors =
    value !== null && typeof value === "object"
      ? [...ancestors, value]
      : ancestors;

  return (
    <div>
      <VariableTile
        name={name}
        value={value}
        circular={circular}
        expandable={expandable}
        expanded={expanded}
        onToggle={() => onToggle(id)}
      />

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
