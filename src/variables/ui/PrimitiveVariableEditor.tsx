import { Check, X } from "lucide-react";
import { useState } from "react";
import { readPropertyPath, type FavoritePath, type VariableLocation } from "../location";

export type Primitive = string | number | boolean;

export function isEditablePrimitive(value: unknown): value is Primitive {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

export function PrimitiveVariableEditor({ name, path, location, original, close }: {
  name: string;
  path: FavoritePath;
  location: Extract<VariableLocation, { kind: "property" }>;
  original: Primitive;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => Object.is(original, -0) ? "-0" : String(original));
  const [error, setError] = useState("");
  const { owner, key } = location;

  function save() {
    const next = typeof original === "number" ? Number(draft)
      : typeof original === "boolean" ? draft === "true" : draft;
    if (typeof next === "number" && (!draft.trim() || !Number.isFinite(next))) {
      setError("Enter a finite number.");
      return;
    }

    try {
      const liveOwner = readPropertyPath({ root: path.root, path: path.path.slice(0, -1) });
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (liveOwner.kind !== "value" || liveOwner.value !== owner ||
          !descriptor?.writable || !Object.is(descriptor.value, original)) {
        setError("Value changed. Reopen the editor.");
        return;
      }
      Object.defineProperty(owner, key, { value: next });
      close();
    } catch {
      setError("Could not save the value.");
    }
  }

  const inputLabel = `New value for ${name}`;
  const inputClass = "w-24 rounded border border-current px-1";
  return <form className="flex shrink-0 items-center gap-1"
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
        className={`${inputClass} resize-none`} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} />
        : <input autoFocus aria-label={inputLabel} className={inputClass}
        value={draft} onChange={(event) => setDraft(event.target.value)} />}
      <button type="submit" className="cursor-pointer rounded p-1" aria-label="Save value" title="Save value">
        <Check size={14} aria-hidden="true" />
      </button>
      <button type="button" className="cursor-pointer rounded p-1" aria-label="Cancel editing" title="Cancel editing" onClick={close}>
        <X size={14} aria-hidden="true" />
      </button>
      {error && <span role="alert" className="text-xs">{error}</span>}
  </form>;
}
