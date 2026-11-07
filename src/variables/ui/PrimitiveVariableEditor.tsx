import { Check, X } from "lucide-react";
import { useState } from "react";
import { type FavoritePath, type Primitive, type VariableLocation } from "../location";
import { variableEdits } from "../edits";
import { variableLocks } from "../locks";

export function PrimitiveVariableEditor({ name, path, location, original, close, lockId, expanded = false }: {
  name: string;
  path: FavoritePath;
  location: Extract<VariableLocation, { kind: "property" }>;
  original: Primitive;
  close: () => void;
  lockId?: number;
  expanded?: boolean;
}) {
  const [draft, setDraft] = useState(() => Object.is(original, -0) ? "-0" : String(original));
  const [error, setError] = useState("");

  function save() {
    const next = typeof original === "number" ? Number(draft)
      : typeof original === "boolean" ? draft === "true" : draft;
    if (typeof next === "number" && (!draft.trim() || !Number.isFinite(next))) {
      setError("Enter a finite number.");
      return;
    }

    const failure = lockId === undefined ? variableEdits.save(path, location, original, next)
      : variableLocks.update(lockId, location, original, next);
    if (failure) setError(failure);
    else close();
  }

  const inputLabel = `New value for ${name}`;
  const inputClass = expanded ? "col-span-2 w-full rounded border border-current px-2 py-1" : "w-24 rounded border border-current px-1";
  const buttonClass = expanded ? "flex cursor-pointer items-center justify-center gap-1 rounded border border-current px-2 py-1" : "cursor-pointer rounded p-1";
  return <form className={expanded ? "grid min-w-0 grid-cols-2 gap-2" : "flex shrink-0 items-center gap-1"}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }} onSubmit={(event) => {
      event.preventDefault();
      save();
    }}>
      {typeof original === "boolean" ? <select autoFocus aria-label={inputLabel} className={inputClass}
        value={draft} onChange={(event) => setDraft(event.target.value)}>
        <option value="false">false</option>
        <option value="true">true</option>
      </select> : typeof original === "string" ? <textarea autoFocus aria-label={inputLabel}
        className={`${inputClass} ${expanded ? "min-h-40 resize-y" : "resize-none"}`} rows={expanded ? 8 : 1} value={draft} onChange={(event) => setDraft(event.target.value)} />
        : <input autoFocus aria-label={inputLabel} className={inputClass}
        value={draft} onChange={(event) => setDraft(event.target.value)} />}
      <button type="submit" className={buttonClass} aria-label="Save value" title="Save value">
        <Check size={14} aria-hidden="true" />{expanded && "Save"}
      </button>
      <button type="button" className={buttonClass} aria-label="Cancel editing" title="Cancel editing" onClick={close}>
        <X size={14} aria-hidden="true" />{expanded && "Cancel"}
      </button>
      {error && <span role="alert" className={expanded ? "col-span-2 text-xs" : "text-xs"}>{error}</span>}
  </form>;
}
