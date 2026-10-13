import type { StateAPI } from "twine-sugarcube";

/** These keys are checked against SugarCube's StateAPI, not an independent scope enum. */
export type VariableStoreKey = keyof Pick<StateAPI, "variables" | "temporary">;

/** SugarCube may not have initialized when our MAIN-world content script mounts. */
function findState(): StateAPI | undefined {
  return typeof SugarCube === "undefined" ? undefined : SugarCube.State;
}

export function hasState(): boolean {
  return findState() !== undefined;
}

/** The inspector mounts only after SugarCube is ready. */
export function getState(): StateAPI {
  const state = findState();
  if (!state) throw new Error("SugarCube.State is not available");
  return state;
}

export function getStore(key: VariableStoreKey): unknown {
  return getState()[key];
}
