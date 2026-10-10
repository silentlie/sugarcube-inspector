import type { PathSegment, WatchPatch } from "./watch";
import type { SugarCubeSnapshot } from "./types";

type Stores = SugarCubeSnapshot["variables"];

function read(value: unknown, part: PathSegment): unknown {
  if (value == null) return undefined;
  if (part.type === "property" || part.type === "index") {
    return (value as Record<string | number, unknown>)[
      part.type === "property" ? part.key : part.index
    ];
  }
  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!(value instanceof Map)) return undefined;
    const entry = [...value.entries()][part.index];
    return entry?.[part.type === "mapKey" ? 0 : 1];
  }
  return value instanceof Set ? [...value][part.index] : undefined;
}

function mergeable(a: object, b: object): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b);
  if (a instanceof Map || b instanceof Map) return a instanceof Map && b instanceof Map;
  if (a instanceof Set || b instanceof Set) return a instanceof Set && b instanceof Set;
  // Native objects such as Date, typed arrays, and RegExp cannot be reconciled
  // as ordinary records. Replace those at the property, not their ancestors.
  const protoA = Object.getPrototypeOf(a);
  const protoB = Object.getPrototypeOf(b);
  return (protoA === Object.prototype || protoA === null) && protoA === protoB;
}

/**
 * Reconcile a cloned watched container into its existing counterpart. Mutating
 * the existing object keeps its aliases and ancestor cycles intact. The memo
 * maps incoming identities to their existing destinations, including self-links.
 *
 * This does not infer live reference reassignment: it deliberately treats a
 * replacement with the same container type as an update of that container.
 */
function reconcile(previous: unknown, incoming: unknown, seen: WeakMap<object, unknown>): unknown {
  if (incoming === null || typeof incoming !== "object") return incoming;
  if (seen.has(incoming)) return seen.get(incoming);
  if (previous === null || typeof previous !== "object" || !mergeable(previous, incoming)) {
    return incoming;
  }

  seen.set(incoming, previous);

  if (previous instanceof Map && incoming instanceof Map) {
    const old = [...previous.entries()];
    previous.clear();
    let i = 0;
    for (const [key, value] of incoming) {
      const prior = old[i++];
      previous.set(
        reconcile(prior?.[0], key, seen),
        reconcile(prior?.[1], value, seen),
      );
    }
    return previous;
  }
  if (previous instanceof Set && incoming instanceof Set) {
    const old = [...previous.values()];
    previous.clear();
    let i = 0;
    for (const value of incoming) previous.add(reconcile(old[i++], value, seen));
    return previous;
  }

  const destination = previous as Record<string, unknown>;
  const source = incoming as Record<string, unknown>;
  const incomingKeys = new Set(Object.keys(source));

  // Only enumerable string keys survive structuredClone. Keep nonenumerable
  // metadata and symbols already on the destination.
  for (const key of Object.keys(destination)) {
    if (!incomingKeys.has(key) && !Reflect.deleteProperty(destination, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${key}`);
    }
  }
  for (const key of incomingKeys) {
    const next = reconcile(
      Object.hasOwn(destination, key) ? Object.getOwnPropertyDescriptor(destination, key)?.value : undefined,
      Object.getOwnPropertyDescriptor(source, key)?.value,
      seen,
    );
    writeProperty(destination, key, next);
  }
  if (Array.isArray(previous) && Array.isArray(incoming)) {
    previous.length = incoming.length;
  }
  return previous;
}

function writeProperty(target: object, key: string | number, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && "value" in descriptor && Object.is(descriptor.value, value)) return;
  Object.defineProperty(target, key, {
    value,
    writable: descriptor && "writable" in descriptor ? descriptor.writable : true,
    configurable: descriptor?.configurable ?? true,
    enumerable: descriptor?.enumerable ?? true,
  });
}

function mutate(root: unknown, path: readonly PathSegment[], patch: WatchPatch): unknown {
  if (path.length === 0) {
    return patch.op === "set" ? reconcile(root, patch.value, new WeakMap()) : undefined;
  }

  const part = path[0]!;
  const rest = path.slice(1);
  if (root == null || typeof root !== "object") {
    // Only additions may create an absent intermediate container.
    if (patch.op === "delete") return root;
    root = part.type === "index" ? [] : {};
  }

  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!(root instanceof Map)) return root;
    const entries = [...root.entries()];
    const entry = entries[part.index];
    if (!entry) return root;
    if (rest.length === 0 && patch.op === "delete") {
      entries.splice(part.index, 1);
    } else {
      const old = entry[part.type === "mapKey" ? 0 : 1];
      const replacement = rest.length
        ? mutate(old, rest, patch)
        : reconcile(old, (patch as Extract<WatchPatch, { op: "set" }>).value, new WeakMap());
      entries[part.index] = part.type === "mapKey"
        ? [replacement, entry[1]] : [entry[0], replacement];
    }
    root.clear();
    for (const [key, value] of entries) root.set(key, value);
    return root;
  }

  if (part.type === "setValue") {
    if (!(root instanceof Set)) return root;
    const values = [...root];
    if (part.index < 0 || part.index >= values.length) return root;
    if (rest.length === 0 && patch.op === "delete") values.splice(part.index, 1);
    else {
      values[part.index] = rest.length
        ? mutate(values[part.index], rest, patch)
        : reconcile(values[part.index], (patch as Extract<WatchPatch, { op: "set" }>).value, new WeakMap());
    }
    root.clear();
    for (const value of values) root.add(value);
    return root;
  }

  const key = part.type === "property" ? part.key : part.index;
  const record = root as Record<string | number, unknown>;
  if (rest.length === 0 && patch.op === "delete") {
    if (!Reflect.deleteProperty(root, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${String(key)}`);
    }
  } else if (rest.length === 0 && key === "length" && Array.isArray(root)) {
    if (patch.op === "set") root.length = patch.value as number;
  } else {
    const old = read(root, part);
    const next = rest.length
      ? mutate(old, rest, patch)
      : reconcile(old, (patch as Extract<WatchPatch, { op: "set" }>).value, new WeakMap());
    // Do not fabricate missing ancestors when processing a deletion.
    if (rest.length && patch.op === "delete" && old === undefined) return root;
    writeProperty(record, key, next);
  }
  return root;
}

/**
 * Apply patches directly to the synchronized graph. The returned Stores object
 * is the original object; only an explicit root replacement changes a scope.
 */
export function applyWatchPatches(variables: Stores, patches: WatchPatch[]): Stores {
  for (const patch of patches) {
    variables[patch.scope] = mutate(variables[patch.scope], patch.path, patch) as Stores[typeof patch.scope];
  }
  return variables;
}
