import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { variableEdits } from "../edits";
import { formatFavoritePath } from "../location";

export default function UndoEdit() {
  const history = useSyncExternalStore(variableEdits.subscribe, variableEdits.getSnapshot);
  const [failure, setFailure] = useState<{ history: typeof history; message: string }>();
  return <div className="mb-1 shrink-0">
    <div role="group" aria-label="Edit history" className="flex gap-2">
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
    </div>
    {failure?.history === history && failure && <p role="alert">{failure.message}</p>}
  </div>;
}
