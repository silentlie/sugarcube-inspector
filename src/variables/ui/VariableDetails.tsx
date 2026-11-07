import { createContext, use, useEffect, useRef, useState } from "react";
import { formatFavoritePath, isEditablePrimitive, type FavoritePath } from "../location";
import { useVariablePath } from "./useVariableWatch";

export const PassageSearchContext = createContext<((path: FavoritePath) => void) | null>(null);

export default function VariableDetails({ path, close }: { path: FavoritePath; close: () => void }) {
  const findPassages = use(PassageSearchContext);
  const current = useVariablePath(path);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
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
    className="max-h-[min(16rem,50%)] shrink-0 overflow-auto border-b border-current px-2 py-1">
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
    {value === undefined ? <p>This path no longer holds a supported primitive value.</p>
      : <pre className="text-xs wrap-anywhere whitespace-pre-wrap">{value}</pre>}
    <p role="status" className="text-xs">{status}</p>
  </section>;
}
