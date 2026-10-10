import { useCallback, useRef, useState } from "react";
import VariableNode from "./VariableNode";
import type { PathSegment, VariableAncestor, VariableScope } from "./types";
import { watchKey } from "../../sugarcube/watch";
import { getChildren } from "./valueUtils";

interface VariableTreeProps {
  scope: VariableScope;
  value: unknown;
}

export default function VariableTree({ scope, value }: VariableTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const registerNode = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  }, []);
  const onNavigate = useCallback((path: readonly PathSegment[]) => {
    const node = path.length === 0
      ? rootRef.current
      : rowRefs.current.get(watchKey({ scope, path: [...path] }));
    node?.scrollIntoView?.({ block: "nearest" });
    node?.focus();
  }, [scope]);

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
  const ancestors: readonly VariableAncestor[] =
    value !== null && typeof value === "object"
      ? [{ value, path: [] }]
      : [];

  if (children.length === 0) {
    return <p className="py-3 text-zinc-500">No variables</p>;
  }

  return (
    <div ref={rootRef} tabIndex={-1}
      className="scroll-mt-5 rounded focus:outline-2 focus:outline-sky-400">
      {children.map((child) => (
        <VariableNode
          key={JSON.stringify(child.segment)}
          name={child.name}
          value={child.value}
          scope={scope}
          path={[child.segment]}
          expandedPaths={expandedPaths}
          onToggle={toggle}
          ancestors={ancestors}
          onNavigate={onNavigate}
          registerNode={registerNode}
        />
      ))}
    </div>
  );
}
