import type { StateAPI } from "twine-sugarcube";
import { getState } from "../sugarcube/state";
import { resolvePropertyPath, type FavoritePath, type Primitive, type VariableLocation } from "./location";
import { variableLocks } from "./locks";
import { variableWatcher } from "./watcher";

type PropertyLocation = Extract<VariableLocation, { kind: "property" }>;
type Edit = { path: FavoritePath; location: PropertyLocation; before: Primitive; after: Primitive; moment: StateAPI["active"] };
type EditHistory = { undo: readonly Edit[]; redo: readonly Edit[] };
const emptyHistory: EditHistory = { undo: [], redo: [] };
let history = emptyHistory;
let stopPolling: (() => void) | undefined;
const listeners = new Set<() => void>();

function publish(next: EditHistory) {
  history = next;
  if (!next.undo.length && !next.redo.length) {
    stopPolling?.();
    stopPolling = undefined;
  } else stopPolling ??= variableWatcher.beforeRefresh(resetForMoment);
  for (const listener of [...listeners]) listener();
}

function resetForMoment(): boolean {
  const edit = history.undo.at(-1) ?? history.redo.at(-1);
  if (!edit || edit.moment === getState().active) return false;
  publish(emptyHistory);
  return true;
}

function move(direction: "undo" | "redo"): string | undefined {
  if (resetForMoment()) return "The passage changed. Edit history was cleared.";
  const edit = history[direction].at(-1);
  if (!edit) return;
  const error = direction === "undo"
    ? writeValue(edit.path, edit.location, edit.after, edit.before)
    : writeValue(edit.path, edit.location, edit.before, edit.after);
  if (!error) publish(direction === "undo"
    ? { undo: history.undo.slice(0, -1), redo: [...history.redo, edit] }
    : { undo: [...history.undo, edit], redo: history.redo.slice(0, -1) });
  return error;
}

function writeValue(path: FavoritePath, location: PropertyLocation, expected: Primitive, value: Primitive): string | undefined {
  try {
    const { owner, key } = location;
    if (variableLocks.blocksEdit(owner, key)) return "Unlock the value before editing.";
    const live = resolvePropertyPath(path);
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (live?.owner !== owner || !descriptor?.writable || !Object.is(descriptor.value, expected)) {
      return "Value changed. Reopen the editor.";
    }
    Object.defineProperty(owner, key, { value });
  } catch {
    return "Could not save the value.";
  }
}

export const variableEdits = {
  getSnapshot: () => history,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  save(path: FavoritePath, location: PropertyLocation, before: Primitive, after: Primitive) {
    resetForMoment();
    const error = writeValue(path, location, before, after);
    if (!error && !Object.is(before, after)) publish({
      undo: [...history.undo, { path, location, before, after, moment: getState().active }].slice(-20), redo: [],
    });
    return error;
  },
  undo: () => move("undo"),
  redo: () => move("redo"),
  clear() { if (history.undo.length || history.redo.length) publish(emptyHistory); },
};
