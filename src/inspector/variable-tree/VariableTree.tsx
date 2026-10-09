import { useCallback, useState } from "react";
import VariableNode from "./VariableNode";
import type { VariableScope } from "./types";

interface VariableTreeProps {
  scope: VariableScope;
  value: unknown;
}

export default function VariableTree({ scope, value }: VariableTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set([JSON.stringify([scope, []])]),
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

  return (
    <VariableNode
      name={scope === "story" ? "$" : "_"}
      value={value}
      scope={scope}
      path={[]}
      expandedPaths={expandedPaths}
      onToggle={toggle}
    />
  );
}
