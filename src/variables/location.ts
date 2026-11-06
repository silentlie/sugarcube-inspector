import detect from "@sindresorhus/is";
import { getStore, type VariableStoreKey } from "../sugarcube/state";
import { boxedPrimitive, preview } from "./valuePreview";

/** Ordinary locations retain live owners. Favourites use root-relative property paths. */
export type FavoritePath = {
  root: VariableStoreKey;
  path: readonly PropertyKey[];
};

export type FavoriteLocation = FavoritePath & { kind: "favorite"; id: number };
export type VariableLocation =
  | FavoriteLocation
  | { kind: "state"; key: VariableStoreKey }
  | { kind: "property"; owner: object; key: PropertyKey }
  /** A Map entry is one node; part selects an expandable key or value child. */
  | { kind: "map"; owner: Map<unknown, unknown>; key: unknown; part?: "key" | "value" }
  | { kind: "set"; owner: Set<unknown>; member: unknown };

/** Enumerated children cannot themselves be synthetic roots or favourites. */
export type ChildLocation = Exclude<VariableLocation, { kind: "state" } | FavoriteLocation>;

type AccessorKind = "getter" | "setter" | "getter/setter";

export type VariableRead =
  | { kind: "value"; value: unknown }
  | { kind: "accessor"; accessor: AccessorKind }
  | { kind: "missing" };

/** Previews are captured at read time so in-place mutations remain observable. */
export type VariableSnapshot =
  | (Extract<VariableRead, { kind: "value" }> & { preview: string; type: string })
  | Exclude<VariableRead, { kind: "value" }>;

/** Only SugarCube's two trusted State getters may be read as accessors. */
export function readLocation(location: VariableLocation): VariableRead {
  switch (location.kind) {
    case "favorite": {
      let value = getStore(location.root);
      if (value === undefined) return { kind: "missing" };
      for (const key of location.path) {
        if (value === null || (typeof value !== "object" && typeof value !== "function")) {
          return { kind: "missing" };
        }
        const current = readLocation({ kind: "property", owner: value, key });
        if (current.kind !== "value") return current;
        value = current.value;
      }
      return { kind: "value", value };
    }
    case "state": {
      const value = getStore(location.key);
      return value === undefined ? { kind: "missing" } : { kind: "value", value };
    }
    case "property": {
      const descriptor = Object.getOwnPropertyDescriptor(location.owner, location.key);
      if (!descriptor) return { kind: "missing" };
      if (!("value" in descriptor)) {
        const accessor = descriptor.get && descriptor.set ? "getter/setter"
          : descriptor.get ? "getter" : "setter";
        return { kind: "accessor", accessor };
      }
      return { kind: "value", value: descriptor.value };
    }
    case "map":
      if (!Map.prototype.has.call(location.owner, location.key)) return { kind: "missing" };
      return {
        kind: "value",
        value: location.part === "key"
          ? location.key
          : Map.prototype.get.call(location.owner, location.key),
      };
    case "set":
      return Set.prototype.has.call(location.owner, location.member)
        ? { kind: "value", value: location.member } : { kind: "missing" };
  }
}

/** A tree label is derived from a live location; no positional indices. */
export function getLocationName(location: VariableLocation): string {
  switch (location.kind) {
    case "favorite":
      return formatFavoritePath(location);
    case "state":
      return location.key;
    case "property":
      return String(location.key);
    case "map":
      return location.part ?? preview(location.key);
    case "set":
      return preview(location.member);
  }
}

/** Format only subscriptions that render values; structure checks use readLocation. */
export function readVariable(location: VariableLocation): VariableSnapshot {
  const current = readLocation(location);
  if (current.kind !== "value") return current;
  return {
    ...current,
    preview: preview(current.value),
    type: boxedPrimitive(current.value)?.type ?? detect(current.value),
  };
}

export function sameVariable(a: VariableSnapshot, b: VariableSnapshot): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "value":
      return b.kind === "value" && Object.is(a.value, b.value) &&
        a.preview === b.preview && a.type === b.type;
    case "accessor":
      return b.kind === "accessor" && a.accessor === b.accessor;
    case "missing":
      return true;
  }
}

/** SugarCube-style names, including brackets for array indices and unusual keys. */
export function formatFavoritePath(location: FavoritePath): string {
  const prefix = location.root === "variables" ? "$" : "_";
  return location.path.reduce<string>((text, key, index) => {
    if (typeof key === "symbol") return text + "[" + String(key) + "]";
    const part = String(key);
    if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      return text + (index === 0 ? "" : ".") + part;
    }
    return text + "[" + (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)
      ? key : JSON.stringify(part)) + "]";
  }, prefix);
}
