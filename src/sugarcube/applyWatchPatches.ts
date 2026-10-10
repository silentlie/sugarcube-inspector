import type { PathSegment, WatchPatch } from "./watch";
import type { SugarCubeSnapshot } from "./types";

type Stores = SugarCubeSnapshot["variables"];

function read(value: unknown, part: PathSegment): unknown {
  if (value == null) return undefined;
  if (part.type === "property" || part.type === "index") {
    const key = part.type === "property" ? part.key : part.index;
    return (value as Record<string | number, unknown>)[key];
  }
  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!(value instanceof Map)) return undefined;
    const entry = Array.from(value.entries())[part.index];
    return entry?.[part.type === "mapKey" ? 0 : 1];
  }
  return value instanceof Set ? Array.from(value)[part.index] : undefined;
}

/**
 * A slice/spread clone loses sparse-array metadata, symbol keys, and named
 * array properties. Copy descriptors instead of using Object.assign, which
 * also treats an own "__proto__" key as a prototype setter.
 *
 * This is for ordinary objects and arrays; Map/Set entries have their own
 * patch handling below.
 */
function shallowCopy(source: object): Record<string | number, unknown> {
  const copy = Array.isArray(source)
    ? []
    : Object.create(Object.getPrototypeOf(source));
  return Object.defineProperties(copy, Object.getOwnPropertyDescriptors(source));
}

function update(
  source: unknown,
  path: readonly PathSegment[],
  patch: WatchPatch,
): unknown {
  if (path.length === 0) return patch.op === "set" ? patch.value : undefined;

  const part = path[0]!;
  const rest = path.slice(1);
  const previous = read(source, part);
  // Deletes must not manufacture a missing ancestor object.
  if (patch.op === "delete" && rest.length > 0 && previous === undefined) {
    return source;
  }
  const replacement = rest.length > 0 ? update(previous, rest, patch) :
    patch.op === "set" ? patch.value : undefined;

  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!(source instanceof Map)) return source;
    const entries = Array.from(source.entries());
    const entry = entries[part.index];
    if (!entry) return source;
    if (rest.length === 0 && patch.op === "delete") {
      entries.splice(part.index, 1);
    } else {
      entries[part.index] = part.type === "mapKey"
        ? [replacement, entry[1]]
        : [entry[0], replacement];
    }
    return new Map(entries);
  }

  if (part.type === "setValue") {
    if (!(source instanceof Set)) return source;
    const values = Array.from(source);
    if (part.index < 0 || part.index >= values.length) return source;
    if (rest.length === 0 && patch.op === "delete") values.splice(part.index, 1);
    else values[part.index] = replacement;
    return new Set(values);
  }

  const copy = source !== null && typeof source === "object"
    ? shallowCopy(source)
    : part.type === "index" ? [] : {};

  const key = part.type === "property" ? part.key : part.index;
  if (Array.isArray(copy) && key === "length") {
    if (patch.op === "set" && typeof replacement === "number") copy.length = replacement;
  } else if (rest.length === 0 && patch.op === "delete") {
    if (!Reflect.deleteProperty(copy, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${String(key)}`);
    }
  } else {
    // Preserve existing descriptor flags where possible. This also handles
    // own "__proto__" properties without invoking a prototype setter.
    const previousDescriptor = Object.getOwnPropertyDescriptor(copy, key);
    Object.defineProperty(copy, key, {
      value: replacement,
      writable: previousDescriptor && "writable" in previousDescriptor
        ? previousDescriptor.writable
        : true,
      configurable: previousDescriptor?.configurable ?? true,
      enumerable: previousDescriptor?.enumerable ?? true,
    });
  }
  return copy;
}

/** Apply changes immutably, cloning only objects along modified paths. */
export function applyWatchPatches(variables: Stores, patches: WatchPatch[]): Stores {
  let current = variables;
  for (const patch of patches) {
    current = {
      ...current,
      [patch.scope]: update(current[patch.scope], patch.path, patch),
    } as Stores;
  }
  return current;
}
