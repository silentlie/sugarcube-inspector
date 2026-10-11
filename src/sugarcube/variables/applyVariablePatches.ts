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
    const entry = entries[part.index]!;
    if (rest.length > 0) {
      const old = entry[part.type === "mapKey" ? 0 : 1];
      const replacement = applyPatchAtPath(old, rest, patch);
      entries[part.index] = part.type === "mapKey"
        ? [replacement, entry[1]] : [entry[0], replacement];
    } else if (patch.op === "delete") {
      entries.splice(part.index, 1);
    } else {
      entries[part.index] = part.type === "mapKey"
        ? [patch.value, entry[1]] : [entry[0], patch.value];
    }
    root.clear();
    for (const [key, value] of entries) root.set(key, value);
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
    if (rest.length > 0) {
      values[part.index] = applyPatchAtPath(values[part.index], rest, patch);
    } else if (patch.op === "delete") {
      values.splice(part.index, 1);
    } else {
      values[part.index] = patch.value;
    }
    root.clear();
    for (const value of values) root.add(value);
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
