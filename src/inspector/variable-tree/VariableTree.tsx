import { useCallback, useRef, useState } from "react";
import VariableNode from "./VariableNode";
import type { PathSegment, VariableAncestor, VariableScope } from "./types";
import { pathToKey } from "../../sugarcube/path";
import { getChildren } from "./valueUtils";
import { useWatch } from "../watch/WatchProvider";
import { useVariableVersion } from "../watch/VariableStore";

interface VariableTreeProps {
  scope: VariableScope;
  value?: unknown;
}

export default function VariableTree({ scope, value }: VariableTreeProps) {
  const watch = useWatch();
  useVariableVersion(watch.store, [{ type: "property", key: scope }]);
  const fromStore = value === undefined;
  const rootValue = fromStore ? watch.store.getValue([{ type: "property", key: scope }]) : value;
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
      : rowRefs.current.get(pathToKey([{ type: "property", key: scope }, ...path]));
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

  const children = getChildren(rootValue);
  const ancestors: readonly VariableAncestor[] =
    rootValue !== null && typeof rootValue === "object"
      ? [{ value: rootValue, path: [] }]
      : [];

  if (children.length === 0) {
    return <p className="py-3 text-zinc-500">No variables</p>;
  }

  return (
    <div ref={rootRef} tabIndex={-1}
      className="scroll-mt-5 rounded focus:outline-2 focus:outline-sky-400">
      {children.map((child) => (
        <VariableNode
          key={pathToKey([child.segment])}
          name={child.name}
          value={child.value}
          fromStore={fromStore}
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
