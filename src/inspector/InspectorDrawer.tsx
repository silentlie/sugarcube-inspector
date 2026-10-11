import { browser } from "wxt/browser";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Entry, Inspection, InspectorMode, ModeNotice, Reply, Request, Target } from "../inspection/protocol";

async function send(request: Request): Promise<InspectorMode | Inspection> {
  const response = await browser.runtime.sendMessage(request) as Reply;
  if (!response?.ok) throw new Error(response?.error ?? "Inspector background did not respond.");
  return response.data;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function VariableRow({ entry }: { entry: Entry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className="flex min-w-0 items-baseline gap-2 rounded px-2 py-1.5 text-xs hover:bg-zinc-800">
        {entry.expandable && entry.target ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
            aria-expanded={expanded}
            className="shrink-0 cursor-pointer text-zinc-400"
            onClick={() => setExpanded((value) => !value)}
          >{expanded ? "▾" : "▸"}</button>
        ) : <span className="inline-block w-3 shrink-0" />}
        <span className="min-w-0 truncate text-zinc-200">{entry.name}</span>
        <span className="ml-auto min-w-0 truncate font-mono text-zinc-400" title={entry.preview}>
          {entry.preview}
        </span>
        {entry.category && entry.category !== "own" && (
          <span className="text-[10px] text-sky-400">{entry.category}</span>
        )}
        {entry.nonEnumerable && <span className="text-[10px] text-zinc-500">hidden</span>}
      </div>
      {expanded && entry.target && (
        <div className="ml-3 border-l border-zinc-700 pl-2">
          <VariableList target={entry.target} />
        </div>
      )}
    </div>
  );
}

function VariableList({ target }: { target: Target }) {
  const [data, setData] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const targetKey = JSON.stringify(target);

  useEffect(() => {
    let active = true;
    const request: Request = {
      type: "inspector:inspect", target: JSON.parse(targetKey) as Target, offset: 0,
    };
    async function load(): Promise<void> {
      for (let attempt = 0; attempt < 12 && active; attempt++) {
        try {
          const value = await send(request) as Inspection;
          // On a new passage the store may exist before SugarCube finishes
          // populating its variables. Retry an initially empty scope briefly.
          if (target.kind === "path" && target.path.segments.length === 0 &&
              value.total === 0 && attempt < 11) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          if (active) setData(value);
          return;
        } catch (cause) {
          const message = errorText(cause);
          if (!message.includes("SugarCube initialization pending.") || attempt === 11) {
            if (active) setError(message);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [targetKey]);

  async function loadMore() {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await send({
        type: "inspector:inspect",
        target,
        offset: data.entries.length,
      }) as Inspection;
      setData((current) => current ? {
        ...next,
        offset: 0,
        entries: [...current.entries, ...next.entries],
      } : current);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <p role="alert" className="p-2 text-xs text-red-400">{error}</p>;
  if (!data) return <p className="p-2 text-xs text-zinc-500">Inspecting live properties...</p>;
  if (data.total === 0) return <p className="p-2 text-xs text-zinc-500">No properties</p>;
  return (
    <div>
      {data.entries.map((entry) => (
        <VariableRow key={entry.name + ":" + entry.category} entry={entry}/>
      ))}
      {data.entries.length < data.total && (
        <button
          type="button"
          className="p-2 text-xs text-sky-300 disabled:opacity-50"
          disabled={loadingMore}
          onClick={() => { void loadMore(); }}
        >
          {loadingMore ? "Loading..." : `Load more (${data.entries.length}/${data.total})`}
        </button>
      )}
    </div>
  );
}

/** One on-page drawer for both MAIN-world inspection and CDP. */
export default function InspectorDrawer() {
  const [mode, setMode] = useState<InspectorMode>({ mode: "main" });
  const [revision, setRevision] = useState(0);
  const [scope, setScope] = useState<"story" | "temporary">("story");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    let noticeReceived = false;
    const listener = (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const notice = message as Partial<ModeNotice>;
      if (notice.type !== "inspector:mode" || !notice.mode) return;
      noticeReceived = true;
      setMode(notice.mode);
      setError(null);
      setRevision((current) => current + 1);
    };
    browser.runtime.onMessage.addListener(listener);
    void send({ type: "inspector:status" }).then(
      (state) => {
        if (active && !noticeReceived) setMode(state as InspectorMode);
      },
      (cause: unknown) => { if (active) setError(errorText(cause)); },
    );
    return () => {
      active = false;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (mode.mode !== "main") return;
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => {
      setRevision((current) => current + 1);
    });
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, [mode.mode]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await send({ type: "inspector:refresh" });
      setMode(next as InspectorMode);
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const key = `${mode.mode}:${mode.sessionId ?? "main"}:${revision}:${scope}`;
  const target: Target = { kind: "path", path: { root: scope, segments: [] } };

  return (
    <section>
      <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-lg font-semibold">SugarCube Inspector</h1>
          <p className="text-xs text-zinc-400">
            {mode.mode === "cdp" ? "Debugger (CDP)" : "MAIN world"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh variables"
          title="Refresh variables"
          disabled={refreshing}
          onClick={() => { void refresh(); }}
          className="rounded p-2 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""}/>
        </button>
      </header>
      <p className="py-2 text-xs text-zinc-500">
        Debugger mode can be enabled in the extension side panel.
      </p>
      <div role="tablist" aria-label="Variable scope" className="flex border-b border-zinc-700">
        {(["story", "temporary"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={`px-3 py-2 text-xs ${scope === value
              ? "border-b-2 border-sky-400 text-white" : "text-zinc-400"}`}
          >
            {value === "story" ? "Story Variables" : "Temporary Variables"}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="p-2 text-xs text-red-400">{error}</p>}
      <div role="tabpanel" aria-label={scope === "story" ? "Story Variables" : "Temporary Variables"}>
        <VariableList key={key} target={target}/>
      </div>
    </section>
  );
}
