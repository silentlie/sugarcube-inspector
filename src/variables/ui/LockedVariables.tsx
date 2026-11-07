import { LockOpen } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { formatFavoritePath, resolvePropertyPath, type Primitive, type VariableLocation, type VariableSnapshot } from "../location";
import { variableLocks } from "../locks";
import { preview } from "../valuePreview";
import { VariableTypePreview, VariableValuePreview } from "./VariableValuePreview";
import { PrimitiveVariableEditor } from "./PrimitiveVariableEditor";

export default function LockedVariables() {
  const locks = useSyncExternalStore(variableLocks.subscribe, variableLocks.getSnapshot);
  const sectionRef = useRef<HTMLElement>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<{ id: number; value: Primitive; location: Extract<VariableLocation, { kind: "property" }> }>();
  const [error, setError] = useState("");

  return <section ref={sectionRef} tabIndex={-1} aria-label="Locked variables"
    className="min-h-0 flex-1 overflow-auto px-2 py-1">
    <div className="mb-2 flex justify-end">
      <button type="button" disabled={locks.length === 0}
        className="cursor-pointer rounded border border-current px-2 py-1 disabled:cursor-default disabled:opacity-50"
        onClick={() => {
          variableLocks.clear();
          sectionRef.current?.focus();
        }}>Unlock All</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {locks.length === 0 ? <p role="status">No locked variables.</p> :
      <ul aria-label="Locked variables">
        {locks.map(({ id, path, value }) => {
          const name = formatFavoritePath(path);
          const current: VariableSnapshot = { kind: "value", value, type: typeof value, preview: preview(value) };
          return <li key={id} className="flex items-center gap-2 py-1">
            <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              aria-label={`Edit locked ${name}`} title="Edit locked value" onClick={(event) => {
                if (editing?.id === id) return;
                try {
                  const location = resolvePropertyPath(path);
                  if (!location) { setError("This locked variable is no longer available."); return; }
                  editButtonRef.current = event.currentTarget;
                  setError("");
                  setEditing({ id, value, location });
                } catch { setError("Could not open the locked value."); }
              }}>
              <span className="min-w-0 flex-1 font-mono text-xs wrap-anywhere">{name}: <VariableTypePreview current={current} /></span>
              <VariableValuePreview current={current} />
            </button>
            {editing?.id === id && <PrimitiveVariableEditor name={name} path={path} location={editing.location}
              original={editing.value} lockId={id} close={() => {
                setEditing(undefined);
                editButtonRef.current?.focus();
              }} />}
            <button type="button" className="shrink-0 cursor-pointer rounded p-1"
              data-unlock aria-label={`Unlock ${name}`} title="Unlock value"
              onClick={(event) => {
                const buttons = [...sectionRef.current!.querySelectorAll<HTMLButtonElement>("ul button[data-unlock]")];
                const index = buttons.indexOf(event.currentTarget);
                const nextFocus = buttons[index + 1] ?? buttons[index - 1] ?? sectionRef.current;
                variableLocks.unlock(id);
                nextFocus?.focus();
              }}>
              <LockOpen size={14} aria-hidden="true" />
            </button>
          </li>;
        })}
      </ul>}
  </section>;
}
