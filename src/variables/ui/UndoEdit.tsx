import { useId, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { variableEdits } from "../edits";
import { formatFavoritePath } from "../location";
import { comparisonValue } from "../comparison";

export default function UndoEdit() {
  const history = useSyncExternalStore(variableEdits.subscribe, variableEdits.getSnapshot);
  const [historyOpen, setHistoryOpen] = useState(false);
  const panelId = useId();
  const edits = [...history.undo, ...history.redo.toReversed()];
  const [failure, setFailure] = useState<{ history: typeof history; message: string }>();
  return <div className="mb-1 shrink-0">
    <div role="group" aria-label="Edit history" className="flex flex-wrap gap-2">
      {(["undo", "redo"] as const).map((direction) => {
        const edit = history[direction].at(-1);
        const backward = direction === "undo";
        return <button key={direction} type="button" disabled={!edit} aria-label={backward ? "Undo edit" : "Redo edit"}
          title={edit ? `${backward ? "Undo" : "Redo"} edit to ${formatFavoritePath(edit.path)}` : undefined}
          className="flex cursor-pointer items-center gap-1 rounded border border-current px-2 py-1 disabled:cursor-default disabled:opacity-50"
          onClick={() => {
            const message = variableEdits[direction]();
            setFailure(message ? { history, message } : undefined);
          }}>
          {backward ? <ChevronLeft size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          {backward ? "Back" : "Forward"}
        </button>;
      })}
      <button type="button" aria-expanded={historyOpen} aria-controls={historyOpen ? panelId : undefined}
        className="cursor-pointer rounded border border-current px-2 py-1"
        onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide edit history" : "Show edit history"}</button>
    </div>
    {failure?.history === history && failure && <p role="alert">{failure.message}</p>}
    {historyOpen && <section id={panelId} tabIndex={0} aria-label="Inspector edit history"
      className="mt-2 max-h-[min(16rem,40vh)] overflow-auto rounded border border-current px-2 py-1 text-xs">
      <p role="status">{edits.length ? `${edits.length} retained edits: ${history.undo.length} applied, ${history.redo.length} undone.` : "No edits yet."}</p>
      {edits.length > 0 && <ol aria-label="Retained edits">
        {edits.map((edit, index) => <li key={edit.id} className="border-t border-current py-1 wrap-anywhere">
          <p className="font-semibold">{formatFavoritePath(edit.path)} · {index < history.undo.length ? "Applied" : "Undone"}</p>
          {index === history.undo.length - 1 && <p>Next Undo · Back</p>}
          {index === history.undo.length && <p>Next Redo · Forward</p>}
          <p>Before: <code>{comparisonValue({ kind: "value", value: edit.before })}</code></p>
          <p>After: <code>{comparisonValue({ kind: "value", value: edit.after })}</code></p>
        </li>)}
      </ol>}
    </section>}
  </div>;
}
