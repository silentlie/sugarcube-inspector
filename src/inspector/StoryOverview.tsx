import { useEffect, useState } from "react";
import { getState } from "../sugarcube/state";

function readOverview() {
  const state = getState();
  const recent = [];
  for (let index = state.length - 2; index >= 0 && recent.length < 10; index--) {
    recent.push({ index, title: state.index(index).title });
  }
  return { passage: state.passage, turn: state.turns, recent };
}

type PassageEventTarget = {
  on: (name: string, callback: () => void) => void;
  off: (name: string, callback: () => void) => void;
};

export default function StoryOverview({ openSource }: { openSource: (name: string) => void }) {
  const [overview, setOverview] = useState(readOverview);
  const name = SugarCube.Story?.name || SugarCube.Story?.title || "SugarCube story";

  useEffect(() => {
    const $ = (window as Window & { jQuery?: (node: Document) => PassageEventTarget }).jQuery;
    if (!$) return;
    const events = $(document);
    const update = () => setOverview(readOverview());
    events.on(":passageend", update);
    return () => events.off(":passageend", update);
  }, []);

  return <section aria-label="Story overview" className="min-h-0 overflow-auto px-1 py-2">
    <h3 className="font-semibold wrap-anywhere">{name}</h3>
    <dl className="my-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" aria-live="polite">
      <dt>Current passage</dt>
      <dd aria-label="Current passage" className="min-w-0 wrap-anywhere">{overview.passage || "Waiting for first passage"}</dd>
      <dt>Turn</dt>
      <dd aria-label="Turn">{overview.turn}</dd>
    </dl>
    {overview.passage && <button type="button" className="mb-3 cursor-pointer rounded border border-current px-2 py-1"
      onClick={() => openSource(overview.passage)}>Open current passage source</button>}
    <h4 className="font-semibold">Recent passages</h4>
    {overview.recent.length > 0 ? <ol aria-label="Recent passages" className="list-decimal pl-5">
      {overview.recent.map(({ index, title }) => <li key={index} className="wrap-anywhere">{title}</li>)}
    </ol> : <p>No previous passages in history.</p>}
  </section>;
}
