import { useState } from "react";
import type { RemoteProperty } from "../debugger/protocol";
import { describeProperty } from "./remoteFormat";

const MAX_SHOWN = 200;

type Props = {
  items: RemoteProperty[];
  inspect: (objectId: string) => Promise<RemoteProperty[]>;
};

function RemoteNode({ item, inspect, depth }: {
  item: RemoteProperty;
  inspect: Props["inspect"];
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<RemoteProperty[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectId = item.value?.objectId;
  const expandable = Boolean(objectId);
  const label = describeProperty(item);

  async function toggle(): Promise<void> {
    if (!expandable || !objectId) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (children) return;
    setLoading(true);
    setError(null);
    try {
      setChildren(await inspect(objectId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="remote-node">
      <div className="remote-line" style={{ paddingInlineStart: depth * 12 }}>
        {expandable ? (
          <button
            className="remote-expand"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
            type="button"
            onClick={() => { void toggle(); }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : <span className="remote-spacer" />}
        <span className="remote-name">{item.name}</span>
        <span className="remote-value" title={label}>{label}</span>
        {item.kind !== "own" && <span className="remote-tag">{item.kind}</span>}
        {item.kind === "own" && item.enumerable === false && (
          <span className="remote-tag">non-enum</span>
        )}
      </div>
      {expanded && loading && <p className="remote-hint">Loading properties…</p>}
      {expanded && error && <p className="remote-error">{error}</p>}
      {expanded && children && (
        children.length ? (
          <ul className="remote-list">
            {children.slice(0, MAX_SHOWN).map((child, index) => (
              <RemoteNode
                key={`${child.kind}:${child.name}:${index}`}
                item={child}
                inspect={inspect}
                depth={depth + 1}
              />
            ))}
            {children.length > MAX_SHOWN && (
              <li className="remote-hint">Showing first {MAX_SHOWN} of {children.length} properties.</li>
            )}
          </ul>
        ) : <p className="remote-hint">No own properties.</p>
      )}
    </li>
  );
}

export function RemoteObjectTree({ items, inspect }: Props) {
  return (
    <ul className="remote-list">
      {items.map((item) => (
        <RemoteNode key={item.name} item={item} inspect={inspect} depth={0} />
      ))}
    </ul>
  );
}
