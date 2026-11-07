import { useState, useSyncExternalStore } from "react";
import { comparisonValue, polledChanges } from "../comparison";
import { formatFavoritePath, type FavoritePath } from "../location";

export default function VariableComparison({ reveal }: { reveal: (path: FavoritePath) => boolean }) {
  const changes = useSyncExternalStore(polledChanges.subscribe, polledChanges.getSnapshot);
  const [error, setError] = useState("");
  return <section aria-label="Variable comparison" className="min-h-0 flex-1 overflow-auto px-2 py-1">
    <p className="mb-2 text-xs">Changes are compared automatically as variables are polled. The last selected variable scope stays active here; favorites keep polling independently. The latest 100 changes last for this page session.</p>
    <button type="button" className="mb-2 cursor-pointer rounded border border-current px-2 py-1"
      disabled={!changes.length} onClick={() => { polledChanges.clear(); setError(""); }}>Clear Changes</button>
    {error && <p role="alert">{error}</p>}
    <p role="status">{changes.length ? `${changes.length} observed changes.` : "No changes observed yet."}</p>
    {changes.length > 0 && <ul aria-label="Variable changes">
      {changes.map(({ id, path, kind, before, after, turn, passage }) => <li key={id} className="border-b border-current py-2 text-xs wrap-anywhere">
        <p className="font-semibold">{formatFavoritePath(path)} · {kind}</p>
        <p>Turn {turn} · {passage}</p>
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
