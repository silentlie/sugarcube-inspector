import { useState } from "react";
import { captureVariableBaseline, compareVariables, comparisonValue, type VariableBaseline, type VariableChange } from "../comparison";
import { favoriteStore } from "../favorites";
import { formatFavoritePath, type FavoritePath } from "../location";

export default function VariableComparison({ reveal }: { reveal: (path: FavoritePath) => boolean }) {
  const [baseline, setBaseline] = useState<VariableBaseline>();
  const [changes, setChanges] = useState<VariableChange[]>();
  const [error, setError] = useState("");
  return <section aria-label="Variable comparison" className="min-h-0 flex-1 overflow-auto px-2 py-1">
    <p className="mb-2 text-xs">Compare top-level primitives in both scopes and favorite paths selected at capture. The baseline lasts for this page session.</p>
    <div className="mb-2 flex gap-2">
      <button type="button" className="cursor-pointer rounded border border-current px-2 py-1" onClick={() => {
        try {
          setBaseline(captureVariableBaseline(favoriteStore.getSnapshot().map(({ location }) => location)));
          setChanges(undefined);
          setError("");
        } catch { setError("Could not capture variable values."); }
      }}>Capture Baseline</button>
      <button type="button" disabled={!baseline}
        className="cursor-pointer rounded border border-current px-2 py-1 disabled:opacity-50" onClick={() => {
          if (!baseline) return;
          try { setChanges(compareVariables(baseline)); setError(""); }
          catch { setError("Could not compare variable values."); }
        }}>Show Changes</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <p role="status">{changes ? `${changes.length} changed variables.` : baseline ? "Baseline captured." : "Capture a baseline before playing or editing."}</p>
    {changes && changes.length > 0 && <ul aria-label="Variable changes">
      {changes.map(({ id, path, kind, before, after }) => <li key={id} className="border-b border-current py-2 text-xs wrap-anywhere">
        <p className="font-semibold">{formatFavoritePath(path)} · {kind}</p>
        <p>Before: <code>{comparisonValue(before)}</code></p>
        <p>After: <code>{comparisonValue(after)}</code></p>
        <button type="button" className="cursor-pointer underline" onClick={() => {
          try { setError(reveal(path) ? "" : "That variable is no longer available."); }
          catch { setError("Could not reveal that variable."); }
        }}>Reveal {formatFavoritePath(path)}</button>
      </li>)}
    </ul>}
  </section>;
}
