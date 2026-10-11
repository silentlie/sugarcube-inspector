import { isArray, isMap, isSet } from "@sindresorhus/is";
import { isNonFunctionObject } from "../../utils/isNonFunctionObject";
import type { PathSegment, VariablePatch } from "../watch/types";
import type { SugarCubeVariables } from "../types";
import { readPathChild } from "./path";

function writeProperty(target: object, key: PropertyKey, value: unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && "value" in descriptor) {
    if (Object.is(descriptor.value, value)) return;

    Object.defineProperty(target, key, { value });
    return;
  }

  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: descriptor?.enumerable ?? true,
    configurable: descriptor?.configurable ?? true,
  });
}

function applyPatchAtPath(root: unknown, path: readonly PathSegment[], patch: VariablePatch): unknown {
  const part = path[0]!;
  const rest = path.slice(1);
  if (!isNonFunctionObject(root)) {
    // MAIN sends whole-value patches to restore missing ancestors; never
    // guess whether an absent intermediate container was an array or object.
    throw new TypeError("Cannot apply a variable patch through a missing or non-object ancestor.");
  }

  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!isMap(root)) {
      throw new TypeError("Expected a Map when applying a variable patch.");
    }
    const entries = [...root.entries()];
    if (!Number.isInteger(part.index) || part.index < 0 || part.index >= entries.length) {
      throw new RangeError(`Map entry index out of bounds: ${part.index}`);
    }
    const [key, value] = entries[part.index]!;
    if (rest.length > 0) {
      // Nested patches mutate the existing key or value without replacing the entry.
      applyPatchAtPath(part.type === "mapKey" ? key : value, rest, patch);
    } else if (patch.op === "delete") {
      root.delete(key);
    } else if (part.type === "mapValue") {
      root.set(key, patch.value);
    } else {
      // Replacing a key must preserve its position in the Map.
      entries[part.index] = [patch.value, value];
      root.clear();
      for (const [entryKey, entryValue] of entries) root.set(entryKey, entryValue);
    }
    return root;
  }

  if (part.type === "setValue") {
    if (!isSet(root)) {
      throw new TypeError("Expected a Set when applying a variable patch.");
    }
    const values = [...root];
    if (!Number.isInteger(part.index) || part.index < 0 || part.index >= values.length) {
      throw new RangeError(`Set entry index out of bounds: ${part.index}`);
    }
    const value = values[part.index];
    if (rest.length > 0) {
      // A nested patch changes the existing member object in place.
      applyPatchAtPath(value, rest, patch);
    } else if (patch.op === "delete") {
      root.delete(value);
    } else {
      // Replacing a member must preserve its position in the Set.
      values[part.index] = patch.value;
      root.clear();
      for (const member of values) root.add(member);
    }
    return root;
  }

  const key = part.key;
  const record = root as Record<string | number, unknown>;
  if (rest.length > 0) {
    const previous = readPathChild(root, part);
    if (previous.status !== "found") {
      throw new Error("Variable patch ancestor does not exist.");
    }
    const next = applyPatchAtPath(previous.value, rest, patch);
    writeProperty(record, key, next);
  } else if (patch.op === "delete") {
    if (!Reflect.deleteProperty(record, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${String(key)}`);
    }
  } else if (key === "length" && isArray(root)) {
    root.length = patch.value as number;
  } else {
    writeProperty(record, key, patch.value);
  }
  return root;
}

/**
 * Apply patches to the synchronized graph by replacing values at their paths.
 * Ancestor containers remain mutable; a whole-value set replaces that value
 * without reconciling its former aliases. The variables object stays stable.
 */
export function applyVariablePatches(variables: SugarCubeVariables, patches: VariablePatch[]): SugarCubeVariables {
  for (const patch of patches) {
    applyPatchAtPath(variables, patch.path, patch);
  }
  return variables;
}
