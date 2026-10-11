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

/** Resolve the next child while preserving collection-specific patch errors. */
function readPatchChild(root: object, part: PathSegment): unknown {
  const child = readPathChild(root, part);
  if (child.status === "found") return child.value;

  if (part.type === "mapKey" || part.type === "mapValue") {
    if (!isMap(root)) throw new TypeError("Expected a Map when applying a variable patch.");
    throw new RangeError(`Map entry index out of bounds: ${part.index}`);
  }

  if (part.type === "setValue") {
    if (!isSet(root)) throw new TypeError("Expected a Set when applying a variable patch.");
    throw new RangeError(`Set entry index out of bounds: ${part.index}`);
  }

  throw new Error("Variable patch ancestor does not exist.");
}

function applyMapPatch(
  root: object,
  part: Extract<PathSegment, { type: "mapKey" | "mapValue" }>,
  patch: VariablePatch,
): void {
  if (!isMap(root)) throw new TypeError("Expected a Map when applying a variable patch.");

  const entries = [...root.entries()];
  if (!Number.isInteger(part.index) || part.index < 0 || part.index >= entries.length) {
    throw new RangeError(`Map entry index out of bounds: ${part.index}`);
  }

  const [key, value] = entries[part.index]!;
  if (patch.op === "delete") {
    root.delete(key);
  } else if (part.type === "mapValue") {
    root.set(key, patch.value);
  } else {
    // A new Map key must retain its entry's original position.
    entries[part.index] = [patch.value, value];
    root.clear();
    for (const [entryKey, entryValue] of entries) root.set(entryKey, entryValue);
  }
}

function applySetPatch(root: object, index: number, patch: VariablePatch): void {
  if (!isSet(root)) throw new TypeError("Expected a Set when applying a variable patch.");

  const values = [...root];
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new RangeError(`Set entry index out of bounds: ${index}`);
  }

  if (patch.op === "delete") {
    root.delete(values[index]);
  } else {
    // Rebuild only when replacing a member, to retain its original position.
    values[index] = patch.value;
    root.clear();
    for (const member of values) root.add(member);
  }
}

function applyPropertyPatch(root: object, key: string, patch: VariablePatch): void {
  if (patch.op === "delete") {
    if (!Reflect.deleteProperty(root, key)) {
      throw new TypeError(`Cannot delete non-configurable property: ${String(key)}`);
    }
  } else if (key === "length" && isArray(root)) {
    root.length = patch.value as number;
  } else {
    writeProperty(root, key, patch.value);
  }
}

function applyPatchAtPath(root: unknown, path: readonly PathSegment[], patch: VariablePatch): void {
  if (!isNonFunctionObject(root)) {
    // MAIN sends whole-value patches to restore missing ancestors; never
    // guess whether an absent intermediate container was an array or object.
    throw new TypeError("Cannot apply a variable patch through a missing or non-object ancestor.");
  }

  const part = path[0]!;
  const rest = path.slice(1);
  if (rest.length > 0) {
    const child = readPatchChild(root, part);
    applyPatchAtPath(child, rest, patch);

    // Existing property accessors must still become own data properties.
    if (part.type === "property") writeProperty(root, part.key, child);
    return;
  }

  if (part.type === "mapKey" || part.type === "mapValue") {
    applyMapPatch(root, part, patch);
  } else if (part.type === "setValue") {
    applySetPatch(root, part.index, patch);
  } else {
    applyPropertyPatch(root, part.key, patch);
  }
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
