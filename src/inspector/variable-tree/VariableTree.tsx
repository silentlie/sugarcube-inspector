import { useCallback, useState } from "react";
import VariableNode from "./VariableNode";
import type { VariableScope } from "./types";
import { getChildren } from "./valueUtils";

interface VariableTreeProps {
  scope: VariableScope;
  value: unknown;
}

export default function VariableTree({ scope, value }: VariableTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((id: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const children = getChildren(value);

  if (children.length === 0) {
    return <p className="py-3 text-zinc-500">No variables</p>;
  }

  return (
    <div>
      {children.map((child) => (
        <VariableNode
          key={JSON.stringify(child.segment)}
          name={child.name}
          value={child.value}
          scope={scope}
          path={[child.segment]}
          expandedPaths={expandedPaths}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
