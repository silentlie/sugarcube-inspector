import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { InspectEntry, InspectPath, InspectResult } from "./lazyInspection";

export type InspectChildren = (path: InspectPath, offset: number) => Promise<InspectResult>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PropertyRow({ entry, parent, inspect }: {
  entry: InspectEntry;
  parent: InspectPath;
  inspect: InspectChildren;
}) {
  const [expanded, setExpanded] = useState(false);
  const path: InspectPath = {
    root: parent.root,
    segments: [...parent.segments, entry.segment],
  };
  const canExpand = entry.expandable;
  return (
    <li className="variable-node">
      <div className="variable-line">
        {canExpand ? (
          <button
            type="button"
            className="variable-toggle"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((was) => !was)}
          >{expanded ? "▾" : "▸"}</button>
        ) : <span className="variable-spacer" />}
        <span className="variable-name">{entry.name}</span>
        <span className="variable-preview" title={entry.preview}>{entry.preview}</span>
        {entry.nonEnumerable && <span className="variable-tag">non-enum</span>}
      </div>
      {expanded && canExpand && <PropertyList path={path} inspect={inspect}/>}
    </li>
  );
}

function PropertyList({ path, inspect }: { path: InspectPath; inspect: InspectChildren }) {
  const pathKey = JSON.stringify(path);
  const [data, setData] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const resolvedPath = JSON.parse(pathKey) as InspectPath;
    void inspect(resolvedPath, 0).then(
      result => { if (active) setData(result); },
      cause => { if (active) setError(message(cause)); },
    );
    return () => { active = false; };
  }, [pathKey, inspect]);

  async function loadMore() {
    if (!data || moreLoading) return;
    setMoreLoading(true);
    try {
      const next = await inspect(path, data.entries.length);
      setData((current) => current && ({
        ...next,
        offset: 0,
        entries: [...current.entries, ...next.entries],
      }));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setMoreLoading(false);
    }
  }

  if (error) return <p className="variable-error" role="alert">{error}</p>;
  if (!data) return <p className="variable-hint">Inspecting live properties…</p>;
  if (data.total === 0) return <p className="variable-hint">No own properties.</p>;

  return (
    <ul className="variable-children">
      {data.entries.map((entry) => (
        <PropertyRow
          key={JSON.stringify(entry.segment)}
          entry={entry}
          parent={path}
          inspect={inspect}
        />
      ))}
      {data.entries.length < data.total && (
        <li>
          <button className="variable-more" type="button"
            disabled={moreLoading} onClick={() => { void loadMore(); }}>
            {moreLoading ? "Loading…" : `Load more (${data.entries.length}/${data.total})`}
          </button>
        </li>
      )}
    </ul>
  );
}

const roots = [
  { name: "Story variables ($)", path: { root: "story", segments: [] } },
  { name: "Temporary variables (_)", path: { root: "temporary", segments: [] } },
] as const satisfies ReadonlyArray<{ name: string; path: InspectPath }>;

export function LiveVariableTree({ inspect }: { inspect: InspectChildren }) {
  return (
    <section aria-label="Live SugarCube variables" className="variable-browser">
      <h2>Live variables</h2>
      {roots.map((scope) => (
        <section className="variable-scope" key={scope.path.root}>
          <h3>{scope.name}</h3>
          <PropertyList path={{ root: scope.path.root, segments: [] }} inspect={inspect}/>
        </section>
      ))}
      <p className="subtle">
        Reads one level at a time. For native debugging of private fields, proxies,
        or unusual objects, use the SugarCube panes in Elements.
      </p>
    </section>
  );
}

/** A refresh remounts the tree so no stale remote paths or expansions survive. */
export function mountVariableTree(container: HTMLElement, inspect: InspectChildren) {
  const reactRoot = createRoot(container);
  let revision = 0;
  function refresh() {
    reactRoot.render(<LiveVariableTree key={revision++} inspect={inspect} />);
  }
  refresh();
  return { refresh, unmount: () => reactRoot.unmount() };
}
