import { LockOpen } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { formatFavoritePath, type VariableSnapshot } from "../location";
import { variableLocks } from "../locks";
import { preview } from "../valuePreview";
import { VariableTypePreview, VariableValuePreview } from "./VariableValuePreview";

export default function LockedVariables() {
  const locks = useSyncExternalStore(variableLocks.subscribe, variableLocks.getSnapshot);
  const sectionRef = useRef<HTMLElement>(null);

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
    {locks.length === 0 ? <p role="status">No locked variables.</p> :
      <ul aria-label="Locked variables">
        {locks.map(({ id, path, value }) => {
          const name = formatFavoritePath(path);
          const current: VariableSnapshot = { kind: "value", value, type: typeof value, preview: preview(value) };
          return <li key={id} className="flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 font-mono text-xs wrap-anywhere">
              {name}: <VariableTypePreview current={current} />
            </span>
            <VariableValuePreview current={current} />
            <button type="button" className="shrink-0 cursor-pointer rounded p-1"
              aria-label={`Unlock ${name}`} title="Unlock value"
              onClick={(event) => {
                const buttons = [...sectionRef.current!.querySelectorAll<HTMLButtonElement>("ul button")];
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
