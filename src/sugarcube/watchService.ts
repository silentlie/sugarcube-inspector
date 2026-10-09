import type { PathSegment, VariableScope, WatchPatch, WatchRequest, WatchResponse, WatchTarget } from "./watch";
import { minimizeWatchTargets, watchKey } from "./watch";

interface Entry {
  exists: boolean;
  value?: unknown;
}

type Stores = Record<VariableScope, Record<string, unknown>>;

function child(value: unknown, segment: PathSegment): Entry {
  if (value == null) return { exists: false };
  if (segment.type === "property" || segment.type === "index") {
    const key = segment.type === "property" ? segment.key : segment.index;
    if (typeof value !== "object" || !Object.hasOwn(value, key)) return { exists: false };
    return { exists: true, value: (value as Record<string | number, unknown>)[key] };
  }
  if (segment.type === "mapKey" || segment.type === "mapValue") {
    if (!(value instanceof Map)) return { exists: false };
    const entry = Array.from(value.entries())[segment.index];
    if (!entry) return { exists: false };
    return { exists: true, value: entry[segment.type === "mapKey" ? 0 : 1] };
  }
  if (!(value instanceof Set)) return { exists: false };
  const values = Array.from(value);
  return segment.index >= 0 && segment.index < values.length
    ? { exists: true, value: values[segment.index] }
    : { exists: false };
}

function resolve(stores: Stores, target: WatchTarget): Entry {
  let entry: Entry = { exists: true, value: stores[target.scope] };
  for (const part of target.path) {
    if (!entry.exists) break;
    entry = child(entry.value, part);
  }
  return entry;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function bytesEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean {
  const left = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

function deepEqual(
  a: unknown,
  b: unknown,
  visited = new WeakMap<object, WeakSet<object>>(),
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;

  const seen = visited.get(a);
  if (seen?.has(b)) return true;
  if (seen) seen.add(b);
  else visited.set(a, new WeakSet([b]));

  if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime());
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) return bytesEqual(a, b);
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    return a.constructor === b.constructor && bytesEqual(a, b);
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    const ai = a.entries(), bi = b.entries();
    for (let i = 0; i < a.size; i++) {
      const left = ai.next().value!;
      const right = bi.next().value!;
      if (!deepEqual(left[0], right[0], visited) || !deepEqual(left[1], right[1], visited)) return false;
    }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const ai = a.values(), bi = b.values();
    for (let i = 0; i < a.size; i++) {
      if (!deepEqual(ai.next().value, bi.next().value, visited)) return false;
    }
    return true;
  }
  if (a instanceof Error && b instanceof Error) {
    return a.name === b.name && a.message === b.message;
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) &&
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      visited,
    ),
  );
}

function segment(parent: Record<string, unknown>, key: string): PathSegment {
  const index = Number(key);
  return Array.isArray(parent) && Number.isInteger(index) &&
    index >= 0 && index < 4294967295 && String(index) === key
    ? { type: "index", index }
    : { type: "property", key };
}

function diff(
  oldValue: unknown,
  newValue: unknown,
  scope: VariableScope,
  path: PathSegment[],
  patches: WatchPatch[],
  visited = new WeakMap<object, WeakSet<object>>(),
): void {
  if (Object.is(oldValue, newValue)) return;
  if (!isPlain(oldValue) || !isPlain(newValue) ||
      Array.isArray(oldValue) !== Array.isArray(newValue)) {
    if (!deepEqual(oldValue, newValue)) {
      patches.push({ op: "set", scope, path, value: newValue });
    }
    return;
  }

  const seen = visited.get(oldValue);
  if (seen?.has(newValue)) return;
  if (seen) seen.add(newValue);
  else visited.set(oldValue, new WeakSet([newValue]));

  if (Array.isArray(oldValue) && Array.isArray(newValue) &&
      oldValue.length !== newValue.length) {
    patches.push({
      op: "set", scope, path: [...path, { type: "property", key: "length" }],
      value: newValue.length,
    });
  }

  for (const key of Object.keys(oldValue)) {
    if (!Object.hasOwn(newValue, key)) {
      patches.push({ op: "delete", scope, path: [...path, segment(oldValue, key)] });
    }
  }
  for (const key of Object.keys(newValue)) {
    const childPath = [...path, segment(newValue, key)];
    if (!Object.hasOwn(oldValue, key)) {
      patches.push({ op: "set", scope, path: childPath, value: newValue[key] });
    } else {
      diff(oldValue[key], newValue[key], scope, childPath, patches, visited);
    }
  }
}

/**
 * A single watch session per inspected page. Values are cloned on every poll
 * to detect in-place mutations; only changed paths are sent over RPC.
 */
export class WatchService {
  private session = "";
  private revision = 0;
  private baselines = new Map<string, Entry>();

  poll(request: WatchRequest, stores: Stores): WatchResponse {
    if (request.session !== this.session) {
      this.session = request.session;
      this.revision = 0;
      this.baselines.clear();
    }
    if (request.revision !== this.revision) {
      // The last reply was lost or timed out: resync the selected paths.
      this.revision = request.revision;
      this.baselines.clear();
    }

    const targets = minimizeWatchTargets(request.targets);
    const active = new Set(targets.map(watchKey));
    for (const key of this.baselines.keys()) {
      if (!active.has(key)) this.baselines.delete(key);
    }

    const patches: WatchPatch[] = [];
    for (const target of targets) {
      const key = watchKey(target);
      const live = resolve(stores, target);
      const current: Entry = live.exists
        ? { exists: true, value: structuredClone(live.value) }
        : { exists: false };
      const previous = this.baselines.get(key);

      if (!previous || previous.exists !== current.exists) {
        patches.push(
          current.exists
            ? { op: "set", scope: target.scope, path: target.path, value: current.value }
            : { op: "delete", scope: target.scope, path: target.path },
        );
      } else if (current.exists) {
        diff(previous.value, current.value, target.scope, target.path, patches);
      }
      this.baselines.set(key, current);
    }

    const baseRevision = this.revision;
    if (patches.length > 0) this.revision++;
    return { session: this.session, baseRevision, revision: this.revision, patches };
  }
}
