import { Check, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import { getStore, type VariableStoreKey } from "../../sugarcube/state";
import type { VariableLocation } from "../location";

type Primitive = string | number | boolean;

export function isEditablePrimitive(value: unknown): value is Primitive {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

export function PrimitiveVariableEditor({ name, root, location, value }: {
  name: string;
  root: VariableStoreKey;
  location: Extract<VariableLocation, { kind: "property" }>;
  value: Primitive;
}) {
  const [original, setOriginal] = useState<Primitive>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const { owner, key } = location;

  function close() {
    setOriginal(undefined);
    editButtonRef.current?.focus();
  }

  function save() {
    const next = typeof original === "number" ? Number(draft)
      : typeof original === "boolean" ? draft === "true" : draft;
    if (typeof next === "number" && (!draft.trim() || !Number.isFinite(next))) {
      setError("Enter a finite number.");
      return;
    }

    try {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (getStore(root) !== owner || !descriptor?.writable || !Object.is(descriptor.value, original)) {
        setError("Value changed. Reopen the editor.");
        return;
      }
      Object.defineProperty(owner, key, { value: next });
      close();
    } catch {
      setError("Could not save the value.");
    }
  }

  if (original === undefined && !Object.getOwnPropertyDescriptor(owner, key)?.writable) return null;

  const inputLabel = `New value for ${name}`;
  const inputClass = "w-24 rounded border border-current px-1";
  return <div className="flex shrink-0 items-center gap-1"
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape" && original !== undefined) {
        event.preventDefault();
        close();
      }
    }}>
    <button ref={editButtonRef} type="button" className="cursor-pointer rounded p-1"
      aria-label={`Edit ${name}`} title="Edit value" aria-expanded={original !== undefined}
      onClick={() => {
        if (original !== undefined) {
          close();
          return;
        }
        setOriginal(value);
        setDraft(Object.is(value, -0) ? "-0" : String(value));
        setError("");
      }}><Pencil size={14} aria-hidden="true" /></button>
    {original !== undefined && <form className="flex items-center gap-1" onSubmit={(event) => {
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
    </form>}
  </div>;
}
