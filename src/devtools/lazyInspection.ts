/**
 * This runs INSIDE the inspected game via devtools.inspectedWindow.eval().
 *
 * Keep it self-contained: the extension sends its source as an expression.
 * It returns only a JSON string of ONE LEVEL of property metadata, never live
 * objects/functions. Property descriptors avoid intentionally calling getters.
 */
export type PathPart =
  | { kind: "property"; key: string }
  | { kind: "symbol"; index: number }
  | { kind: "mapKey" | "mapValue" | "setValue"; index: number };

export type InspectPath = {
  root: "story" | "temporary";
  segments: PathPart[];
};

export type InspectEntry = {
  name: string;
  segment: PathPart;
  preview: string;
  expandable: boolean;
  nonEnumerable?: boolean;
  accessor?: "getter" | "setter" | "getter/setter";
};

export type InspectResult = {
  entries: InspectEntry[];
  total: number;
  offset: number;
};

export const PAGE_SIZE = 100;

export function inspectInPage(path: InspectPath, offset: number): string {
  // All functions and constants used in this body must live here, not in the
  // extension closure. Evaluation takes place in a different JS world.
  type Part = PathPart;
  type Entry = InspectEntry;
  const limit = 100;

  function describe(value: unknown): { preview: string; expandable: boolean } {
    if (value === null) return { preview: "null", expandable: false };
    switch (typeof value) {
      case "undefined": return { preview: "undefined", expandable: false };
      case "boolean":
      case "number":
      case "bigint": return { preview: String(value), expandable: false };
      case "string": {
        const sample = value.length > 100 ? value.slice(0, 100) + "…" : value;
        return { preview: JSON.stringify(sample), expandable: false };
      }
      case "symbol": return { preview: String(value), expandable: false };
      case "function": return { preview: "[Function]", expandable: true };
      default: {
        if (Array.isArray(value)) {
          return { preview: "Array(" + value.length + ")", expandable: true };
        }
        if (value instanceof Map) {
          const size = Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!.call(value) as number;
          return { preview: "Map(" + size + ")", expandable: true };
        }
        if (value instanceof Set) {
          const size = Object.getOwnPropertyDescriptor(Set.prototype, "size")!.get!.call(value) as number;
          return { preview: "Set(" + size + ")", expandable: true };
        }
        return { preview: "Object", expandable: true };
      }
    }
  }

  function ownEntries(target: object): Entry[] {
    const keys = Reflect.ownKeys(target);
    let symbolIndex = 0;
    const items: Entry[] = [];
    for (const key of keys) {
      const part: Part = typeof key === "symbol"
        ? { kind: "symbol", index: symbolIndex++ }
        : { kind: "property", key };
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor) continue;
      const accessor = !("value" in descriptor)
        ? descriptor.get && descriptor.set ? "getter/setter"
          : descriptor.get ? "getter" : "setter"
        : undefined;
      const display = accessor
        ? { preview: "[" + accessor + "]", expandable: false }
        : describe(descriptor.value);
      items.push({
        name: typeof key === "symbol" ? String(key) : key,
        segment: part,
        preview: display.preview,
        expandable: display.expandable,
        nonEnumerable: !descriptor.enumerable || undefined,
        accessor,
      });
    }
    return items;
  }

  try {
    const cube = (globalThis as typeof globalThis & {
      SugarCube?: { State?: { variables?: unknown; temporary?: unknown } };
    }).SugarCube;
    let value: unknown = path.root === "story"
      ? cube?.State?.variables
      : cube?.State?.temporary;

    for (const part of path.segments) {
      if (value === null || (typeof value !== "object" && typeof value !== "function")) {
        throw new Error("Variable path no longer exists.");
      }
      if (part.kind === "mapKey" || part.kind === "mapValue") {
        if (!(value instanceof Map)) throw new Error("Expected a Map at this path.");
        const item = Array.from(value.entries())[part.index];
        if (!item) throw new Error("Map entry no longer exists.");
        value = part.kind === "mapKey" ? item[0] : item[1];
      } else if (part.kind === "setValue") {
        if (!(value instanceof Set)) throw new Error("Expected a Set at this path.");
        const members = Array.from(value.values());
        if (part.index >= members.length) throw new Error("Set entry no longer exists.");
        value = members[part.index];
      } else {
        const key = part.kind === "symbol"
          ? Reflect.ownKeys(value).filter((candidate) => typeof candidate === "symbol")[part.index]
          : part.key;
        if (key === undefined) throw new Error("Property no longer exists.");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor) throw new Error("Property no longer exists.");
        if (!("value" in descriptor)) {
          throw new Error("Accessors cannot be expanded without invoking their getter.");
        }
        value = descriptor.value;
      }
    }

    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      return JSON.stringify({ entries: [], total: 0, offset });
    }

    const entries: Entry[] = [];
    if (value instanceof Map) {
      let i = 0;
      for (const [key, child] of value) {
        entries.push({
          name: "[" + i + "] key",
          segment: { kind: "mapKey", index: i },
          ...describe(key),
        });
        entries.push({
          name: "[" + i + "] value",
          segment: { kind: "mapValue", index: i },
          ...describe(child),
        });
        i++;
      }
    } else if (value instanceof Set) {
      let i = 0;
      for (const child of value) {
        entries.push({
          name: "[" + i + "]",
          segment: { kind: "setValue", index: i },
          ...describe(child),
        });
        i++;
      }
    }
    entries.push(...ownEntries(value));
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    return JSON.stringify({
      entries: entries.slice(safeOffset, safeOffset + limit),
      total: entries.length,
      offset: safeOffset,
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function inspectExpression(path: InspectPath, offset = 0): string {
  return `(${inspectInPage.toString()})(${JSON.stringify(path)}, ${offset})`;
}

export function decodeInspection(response: unknown): InspectResult {
  const raw = response && typeof response === "object" && "result" in response
    ? (response as { result: unknown }).result
    : response;
  if (typeof raw !== "string") throw new Error("Unexpected DevTools inspection response.");
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid inspection response.");
  }
  if ("error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  if (!("entries" in data) || !Array.isArray(data.entries) ||
      !("total" in data) || typeof data.total !== "number" ||
      !("offset" in data) || typeof data.offset !== "number") {
    throw new Error("Invalid inspection response.");
  }
  for (const entry of data.entries) {
    if (typeof entry !== "object" || entry === null ||
        typeof entry.name !== "string" ||
        typeof entry.preview !== "string" ||
        typeof entry.expandable !== "boolean" ||
        typeof entry.segment !== "object" || entry.segment === null) {
      throw new Error("Invalid property in inspection response.");
    }
  }
  return data as InspectResult;
}
