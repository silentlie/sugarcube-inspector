import { isFunction, isObject } from "@sindresorhus/is";

/** Objects without functions; unlike isObject(), functions are excluded. */
export function isNonFunctionObject(value: unknown): value is object {
  return isObject(value) && !isFunction(value);
}
