import { useState, useSyncExternalStore } from "react";
import { variableEdits } from "../edits";
import { formatFavoritePath } from "../location";

export default function UndoEdit() {
  const edit = useSyncExternalStore(variableEdits.subscribe, variableEdits.getSnapshot);
  const [failure, setFailure] = useState<{ edit: typeof edit; message: string }>();
  return <div className="mb-1 shrink-0">
    <button type="button" disabled={!edit} title={edit ? `Undo edit to ${formatFavoritePath(edit.path)}` : undefined}
      className="cursor-pointer rounded border border-current px-2 py-1 disabled:cursor-default disabled:opacity-50"
      onClick={() => {
        const message = variableEdits.undo();
        setFailure(message ? { edit, message } : undefined);
      }}>Undo Last Edit</button>
    {failure?.edit === edit && failure && <p role="alert">{failure.message}</p>}
  </div>;
}
