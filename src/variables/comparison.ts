import { getStore } from "../sugarcube/state";
import { inspectorSettingsKey } from "./favoriteStorage";
import { isEditablePrimitive, readPropertyPath, type FavoritePath, type Primitive } from "./location";

type CapturedValue = { kind: "value"; value: Primitive } | { kind: "missing" } | { kind: "other" };
type Entry = { path: FavoritePath; value: CapturedValue };
export type VariableBaseline = readonly Entry[];
export type VariableChange = { id: string; path: FavoritePath; kind: "added" | "removed" | "changed"; before: CapturedValue; after: CapturedValue };

function pathKeys() {
  const symbols = new Map<symbol, number>();
  return ({ root, path }: FavoritePath) => JSON.stringify([root, path.map((key) => {
    if (typeof key !== "symbol") return String(key);
    if (!symbols.has(key)) symbols.set(key, symbols.size);
    return { symbol: symbols.get(key) };
  })]);
}

function capture(path: FavoritePath): CapturedValue {
  const current = readPropertyPath(path);
  if (current.kind === "missing") return current;
  return current.kind === "value" && isEditablePrimitive(current.value)
    ? { kind: "value", value: current.value } : { kind: "other" };
}

export function captureVariableBaseline(paths: readonly FavoritePath[]): VariableBaseline {
  const entries = new Map<string, Entry>();
  const keyFor = pathKeys();
  const add = (path: FavoritePath) => {
    if (path.root === "variables" && path.path[0] === inspectorSettingsKey) return;
    const saved = { root: path.root, path: [...path.path] };
    entries.set(keyFor(saved), { path: saved, value: capture(saved) });
  };
  for (const root of ["variables", "temporary"] as const) {
    const store = getStore(root);
    if (!store || typeof store !== "object") continue;
    for (const key of Reflect.ownKeys(store)) add({ root, path: [key] });
  }
  for (const path of paths) add(path);
  return [...entries.values()];
}

export function compareVariables(baseline: VariableBaseline): VariableChange[] {
  const current = captureVariableBaseline(baseline.map(({ path }) => path));
  const keyFor = pathKeys();
  const before = new Map(baseline.map((entry) => [keyFor(entry.path), entry]));
  const after = new Map(current.map((entry) => [keyFor(entry.path), entry]));
  const changes: VariableChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key);
    const next = after.get(key);
    const a = old?.value ?? { kind: "missing" };
    const b = next?.value ?? { kind: "missing" };
    if (a.kind !== "value" && b.kind !== "value") continue;
    if (a.kind === "value" && b.kind === "value" && Object.is(a.value, b.value)) continue;
    changes.push({ id: key, path: (old ?? next)!.path, before: a, after: b,
      kind: a.kind === "missing" ? "added" : b.kind === "missing" ? "removed" : "changed" });
  }
  return changes;
}

export function comparisonValue(value: CapturedValue): string {
  return value.kind === "missing" ? "Missing" : value.kind === "other" ? "Not a supported primitive"
    : Object.is(value.value, -0) ? "-0" : JSON.stringify(value.value);
}
