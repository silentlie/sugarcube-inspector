import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Scope } from "../inspection/direct";
import { variableWatcher } from "../inspection/variableWatcher";
import VariableTree from "./VariableTree";

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
export default function DirectInspector() {
  const [scope, setScope] = useState<Scope>("story");

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => variableWatcher.refresh());
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <section>
      <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-lg font-semibold">SugarCube Inspector</h1>
          <p className="text-xs text-sky-300">MAIN world · direct references</p>
        </div>
        <button type="button" aria-label="Refresh variables" title="Refresh variables"
          className="rounded p-2 text-zinc-300 hover:bg-zinc-800"
          onClick={() => variableWatcher.refresh()}>
          <RefreshCw size={16} />
        </button>
      </header>
      <p className="py-2 text-xs text-zinc-500">
        Live variable tiles update independently. +1 edits actual game values.
      </p>
      <div role="tablist" aria-label="Variable scope" className="flex border-b border-zinc-700">
        {(["story", "temporary"] as const).map((option) => (
          <button key={option} role="tab" type="button"
            aria-selected={scope === option} onClick={() => setScope(option)}
            className={`px-3 py-2 text-xs ${scope === option
              ? "border-b-2 border-sky-400 text-white" : "text-zinc-400"}`}>
            {option === "story" ? "Story Variables" : "Temporary Variables"}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={scope === "story" ? "Story Variables" : "Temporary Variables"}>
        <VariableTree scope={scope} />
      </div>
    </section>
  );
}
