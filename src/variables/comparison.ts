import { getState } from "../sugarcube/state";
import { inspectorSettingsKey } from "./favoriteStorage";
import { isEditablePrimitive, readLocation, type FavoritePath, type Primitive, type VariableRead } from "./location";

type CapturedValue = { kind: "value"; value: Primitive } | { kind: "missing" } | { kind: "other" };
type Entry = { path: FavoritePath; value: CapturedValue };
export type VariableBaseline = readonly Entry[];
export type VariableChange = { id: string; path: FavoritePath; kind: "added" | "removed" | "changed"; before: CapturedValue; after: CapturedValue };
type ObservedChange = VariableChange & { turn: number; passage: string };

function hidden(path: FavoritePath) {
  return path.root === "variables" && path.path[0] === inspectorSettingsKey;
}
function captureValue(current: VariableRead): CapturedValue {
  return current.kind === "missing" ? current : current.kind === "value" && isEditablePrimitive(current.value)
    ? { kind: "value", value: current.value } : { kind: "other" };
}
function sameValue(a: CapturedValue, b: CapturedValue) {
  return a.kind === b.kind && (a.kind !== "value" || b.kind === "value" && Object.is(a.value, b.value));
}
function pathKeys() {
  const symbols = new Map<symbol, number>();
  return ({ root, path }: FavoritePath) => JSON.stringify([root, path.map((key) => {
    if (typeof key !== "symbol") return String(key);
    if (!symbols.has(key)) symbols.set(key, symbols.size);
    return { symbol: symbols.get(key) };
  })]);
}

/** Snapshot direct own properties only; descriptors never evaluate story getters. */
export function captureChildren(parent: FavoritePath, value: unknown): VariableBaseline {
  if (value === null || typeof value !== "object" && typeof value !== "function") return [];
  const entries: Entry[] = [];
  for (const key of Reflect.ownKeys(value)) {
    const path = { root: parent.root, path: [...parent.path, key] };
    if (!hidden(path)) entries.push({ path, value: captureValue(readLocation({ kind: "property", owner: value, key })) });
  }
  return entries;
}

export function compareVariables(baseline: VariableBaseline, current: VariableBaseline): VariableChange[] {
  const keyFor = pathKeys();
  const before = new Map(baseline.map((entry) => [keyFor(entry.path), entry]));
  const after = new Map(current.map((entry) => [keyFor(entry.path), entry]));
  const changes: VariableChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key);
    const next = after.get(key);
    const a = old?.value ?? { kind: "missing" };
    const b = next?.value ?? { kind: "missing" };
    if (a.kind !== "value" && b.kind !== "value" || sameValue(a, b)) continue;
    changes.push({ id: key, path: (old ?? next)!.path, before: a, after: b,
      kind: a.kind === "missing" ? "added" : b.kind === "missing" ? "removed" : "changed" });
  }
  return changes;
}

export class PolledChanges {
  private changes: readonly ObservedChange[] = [];
  private nextId = 0;
  private readonly listeners = new Set<() => void>();
  private batch: object | undefined;
  private keyFor = pathKeys();
  private readonly sampled = new Map<string, CapturedValue>();
  getSnapshot = () => this.changes;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  observe(before: VariableBaseline, after: VariableBaseline, batch: object = {}) {
    if (this.batch !== batch) {
      this.batch = batch;
      this.sampled.clear();
      this.keyFor = pathKeys();
    }
    const added: ObservedChange[] = [];
    for (const change of compareVariables(before, after)) {
      const key = this.keyFor(change.path);
      const sampled = this.sampled.get(key);
      // Only overlapping observations from this poll share a deduplication window.
      if (sampled && sameValue(sampled, change.after)) continue;
      this.sampled.set(key, change.after);
      const { turns: turn, passage } = getState();
      added.push({ ...change, id: String(this.nextId++), turn, passage });
    }
    // An unchanged favorite can already account for a resumed tree's stale baseline.
    for (const { path, value } of after) this.sampled.set(this.keyFor(path), value);
    if (!added.length) return;
    this.changes = [...added.reverse(), ...this.changes].slice(0, 100);
    for (const listener of this.listeners) listener();
  }
  observeValue(path: FavoritePath, before: VariableRead, after: VariableRead, batch: object) {
    if (!hidden(path)) this.observe([{ path, value: captureValue(before) }], [{ path, value: captureValue(after) }], batch);
  }
  clear = () => {
    if (!this.changes.length) return;
    this.changes = [];
    this.sampled.clear();
    for (const listener of this.listeners) listener();
  };
}
export const polledChanges = new PolledChanges();

export function comparisonValue(value: CapturedValue): string {
  return value.kind === "missing" ? "Missing" : value.kind === "other" ? "Not a supported primitive"
    : Object.is(value.value, -0) ? "-0" : JSON.stringify(value.value);
}
