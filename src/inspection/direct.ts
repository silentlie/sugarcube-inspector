/** Direct references are intentionally kept inside the game's MAIN world. */
export type Scope = "story" | "temporary";

export type DirectEntry = {
  name: string;
  preview: string;
  value: unknown;
  expandable: boolean;
  hidden: boolean;
  accessor?: "getter" | "setter" | "getter/setter";
  owner?: object;
  key?: PropertyKey;
  incrementable: boolean;
};

export function getStore(scope: Scope): unknown {
  const cube = (globalThis as typeof globalThis & {
    SugarCube?: { State?: { variables?: unknown; temporary?: unknown } };
  }).SugarCube;
  return scope === "story" ? cube?.State?.variables : cube?.State?.temporary;
}

export function isReference(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function preview(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "undefined": return "undefined";
    case "string": {
      const excerpt = value.length > 100 ? value.slice(0, 100) + "…" : value;
      return JSON.stringify(excerpt);
    }
    case "bigint":
    case "number":
    case "boolean":
    case "symbol": return String(value);
    case "function": return "[Function]";
    default:
      if (Array.isArray(value)) return `Array(${value.length})`;
      if (value instanceof Map) return `Map(${value.size})`;
      if (value instanceof Set) return `Set(${value.size})`;
      return "Object";
  }
}

/** Descriptors are read directly, without invoking ordinary getter functions. */
export function inspectDirect(value: unknown): DirectEntry[] {
  if (!isReference(value)) return [];
  const entries: DirectEntry[] = [];

  if (value instanceof Map) {
    let i = 0;
    for (const [key, child] of value) {
      for (const [suffix, item] of [["key", key], ["value", child]] as const) {
        entries.push({
          name: `[${i}] ${suffix}`,
          preview: preview(item),
          value: item,
          expandable: isReference(item),
          hidden: false,
          incrementable: false,
        });
      }
      i++;
    }
  } else if (value instanceof Set) {
    let i = 0;
    for (const item of value) {
      entries.push({
        name: `[${i++}]`,
        preview: preview(item),
        value: item,
        expandable: isReference(item),
        hidden: false,
        incrementable: false,
      });
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    const accessor = !("value" in descriptor)
      ? descriptor.get && descriptor.set ? "getter/setter"
        : descriptor.get ? "getter" : "setter"
      : undefined;
    const child = "value" in descriptor ? descriptor.value : undefined;
    entries.push({
      name: typeof key === "symbol" ? String(key) : key,
      preview: accessor ? `[${accessor}]` : preview(child),
      value: child,
      expandable: !accessor && isReference(child),
      hidden: !descriptor.enumerable,
      ...(accessor && { accessor }),
      owner: value,
      key,
      incrementable: !accessor && descriptor.writable === true &&
        typeof child === "number" && Number.isFinite(child),
    });
  }

  return entries;
}

/** Minimal explicit write operation, used to prove a UI event has live access. */
export function incrementDirect(entry: DirectEntry): void {
  if (!entry.incrementable || !entry.owner || entry.key === undefined ||
      typeof entry.value !== "number") {
    throw new Error("This property cannot be incremented.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(entry.owner, entry.key);
  if (!descriptor || !("value" in descriptor) || !descriptor.writable ||
      typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value)) {
    throw new Error("Property is no longer a writable number.");
  }
  if (!Reflect.set(entry.owner, entry.key, descriptor.value + 1)) {
    throw new Error("The game rejected the write.");
  }
}
