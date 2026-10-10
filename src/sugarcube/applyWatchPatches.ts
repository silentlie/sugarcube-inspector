import type { PathSegment, WatchPatch } from "./watch";
import type { SugarCubeSnapshot } from "./types";
import { readPathChild } from "./path";

type Stores = SugarCubeSnapshot["variables"];

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
    return patch.op === "set" ? patch.value : undefined;
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
        : (patch as Extract<WatchPatch, { op: "set" }>).value;
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
        : (patch as Extract<WatchPatch, { op: "set" }>).value;
    }
    root.clear();
    for (const value of values) root.add(value);
    return root;
  }

  const key = part.type === "property" ? part.key : part.index;
  const record = root as Record<string | number, unknown>;
  if (rest.length === 0 && patch.op === "delete") {
    if (!Reflect.deleteProperty(record, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${String(key)}`);
    }
  } else if (rest.length === 0 && key === "length" && Array.isArray(root)) {
    if (patch.op === "set") root.length = patch.value as number;
  } else {
    const previous = readPathChild(root, part);
    const old = previous.status === "found" ? previous.value : undefined;
    const next = rest.length
      ? mutate(old, rest, patch)
      : (patch as Extract<WatchPatch, { op: "set" }>).value;
    // Do not fabricate missing ancestors when processing a deletion.
    if (rest.length && patch.op === "delete" && old === undefined) return root;
    writeProperty(record, key, next);
  }
  return root;
}

/**
 * Apply patches to the synchronized graph by replacing values at their paths.
 * Ancestor containers remain mutable; a whole-value set replaces that value
 * without reconciling its former aliases. The Stores object stays stable.
 */
export function applyWatchPatches(variables: Stores, patches: WatchPatch[]): Stores {
  for (const patch of patches) {
    mutate(variables, patch.path, patch);
  }
  return variables;
}
