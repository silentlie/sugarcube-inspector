import { createContext, use, useEffect, useRef, useState } from "react";
import { formatFavoritePath, isEditablePrimitive, readLocation, resolvePropertyPath, type FavoritePath, type VariableLocation } from "../location";
import { useVariablePath } from "./useVariableWatch";
import { PrimitiveVariableEditor } from "./PrimitiveVariableEditor";
import { variableLocks } from "../locks";
import { sameFavoritePath } from "../favorites";

export const PassageSearchContext = createContext<((path: FavoritePath) => void) | null>(null);

export default function VariableDetails({ path, close }: { path: FavoritePath; close: () => void }) {
  const findPassages = use(PassageSearchContext);
  const current = useVariablePath(path);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{ path: FavoritePath; location: Extract<VariableLocation, { kind: "property" }>; original: string; lockId?: number }>();
  if (editing && editing.path !== path) setEditing(undefined);
  useEffect(() => headingRef.current?.focus(), []);
  const value = current.kind === "value" && isEditablePrimitive(current.value)
    ? Object.is(current.value, -0) ? "-0" : String(current.value) : undefined;
  const name = formatFavoritePath(path);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      setStatus("Could not copy. Select the text to copy it manually.");
    }
  }
  return <section aria-label="Variable details"
    className={`${editing ? "max-h-[min(28rem,70%)]" : "max-h-[min(16rem,50%)]"} shrink-0 overflow-auto border-b border-current px-2 py-1`}>
    <div className="flex items-start justify-between gap-2">
      <h4 ref={headingRef} tabIndex={-1} className="min-w-0 font-semibold wrap-anywhere">{name}</h4>
      <button type="button" className="shrink-0 cursor-pointer underline" onClick={close}>Close details</button>
    </div>
    <div className="flex gap-3 py-1 text-xs">
      <button type="button" className="cursor-pointer underline" onClick={() => void copy(name)}>Copy Path</button>
      <button type="button" className="cursor-pointer underline" disabled={value === undefined}
        onClick={() => value !== undefined && void copy(value)}>Copy Value</button>
    </div>
    {findPassages && <button type="button" className="mb-1 cursor-pointer text-xs underline"
      onClick={() => findPassages(path)}>Find in Passages</button>}
    {current.kind === "value" && typeof current.value === "string" && current.editable &&
      <button ref={editButtonRef} type="button" className="mb-1 ml-3 cursor-pointer text-xs underline"
        aria-expanded={Boolean(editing)} disabled={Boolean(editing)} onClick={() => {
          try {
            const location = resolvePropertyPath(path);
            const live = location && readLocation(location);
            const lock = variableLocks.getSnapshot().find((item) => sameFavoritePath(item.path, path));
            const original = lock ? lock.value : live?.kind === "value" ? live.value : undefined;
            if (!location || live?.kind !== "value" || !live.editable || typeof live.value !== "string" || typeof original !== "string") {
              setStatus("This path is no longer an editable string.");
              return;
            }
            setStatus("");
            setEditing({ path, location, original, lockId: lock?.id });
          } catch { setStatus("Could not open the string editor."); }
        }}>Edit string</button>}
    {editing && <PrimitiveVariableEditor expanded name={name} path={path} location={editing.location}
      original={editing.original} lockId={editing.lockId} close={() => {
        setEditing(undefined);
        requestAnimationFrame(() => (editButtonRef.current ?? headingRef.current)?.focus());
      }} />}
    {value === undefined ? <p>This path no longer holds a supported primitive value.</p>
      : <pre className="text-xs wrap-anywhere whitespace-pre-wrap">{value}</pre>}
    <p role="status" className="text-xs">{status}</p>
  </section>;
}
