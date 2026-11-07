import type { StateAPI } from "twine-sugarcube";
import { getState } from "../sugarcube/state";
import { resolvePropertyPath, type FavoritePath, type Primitive, type VariableLocation } from "./location";
import { variableLocks } from "./locks";

type PropertyLocation = Extract<VariableLocation, { kind: "property" }>;
type LastEdit = { path: FavoritePath; location: PropertyLocation; before: Primitive; after: Primitive; moment: StateAPI["active"] };
let lastEdit: LastEdit | null = null;
const listeners = new Set<() => void>();

function publish(edit: LastEdit | null) {
  lastEdit = edit;
  for (const listener of [...listeners]) listener();
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
  getSnapshot: () => lastEdit,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  save(path: FavoritePath, location: PropertyLocation, before: Primitive, after: Primitive) {
    const error = writeValue(path, location, before, after);
    if (!error && !Object.is(before, after)) publish({ path, location, before, after, moment: getState().active });
    return error;
  },
  undo(): string | undefined {
    if (!lastEdit) return;
    if (lastEdit.moment !== getState().active) return "The passage changed. This edit can no longer be undone.";
    const error = writeValue(lastEdit.path, lastEdit.location, lastEdit.after, lastEdit.before);
    if (!error) publish(null);
    return error;
  },
  clear() { publish(null); },
};
