/**
 * Experimental fail-fast comparator for structured-clone-compatible watch values.
 *
 * A false positive just causes an extra refresh; a false negative leaves stale UI.
 * Intentionally treats reordered Map/Set entries and unsupported objects as changed.
 * Keep this separate from the production WatchService until benchmarking is complete.
 */
const hasOwn = Object.prototype.hasOwnProperty;
const objectTag = Object.prototype.toString;

interface References {
  has(key: object): boolean;
  get(key: object): object | undefined;
  set(key: object, value: object): unknown;
}

/** Defer allocation of reference tables for one-object and shallow comparisons. */
class LazyReferences implements References {
  private firstKey: object | undefined;
  private firstValue: object | undefined;
  private rest: WeakMap<object, object> | undefined;

  has(key: object): boolean {
    return this.rest?.has(key) ?? this.firstKey === key;
  }

  get(key: object): object | undefined {
    return this.rest?.get(key) ?? (this.firstKey === key ? this.firstValue : undefined);
  }

  set(key: object, value: object): void {
    if (this.firstKey === undefined) {
      this.firstKey = key;
      this.firstValue = value;
      return;
    }
    if (this.rest === undefined) {
      this.rest = new WeakMap([[this.firstKey, this.firstValue!]]);
    }
    this.rest.set(key, value);
  }
}

type ArrayStrategy = "keys-first" | "values-first" | "values-reverse";

export function equalWatchedValues(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new WeakMap(), new WeakMap(), "keys-first");
}

/** Compare array elements before enumerating keys (still checks holes and custom keys). */
export function equalWatchedValuesArrayFirst(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new WeakMap(), new WeakMap(), "values-first");
}

/** Compare with strong Map-based pair tracking instead of WeakMaps. */
export function equalWatchedValuesMapRefs(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new Map(), new Map(), "keys-first");
}

/** Combine array-first traversal with strong Map-based pair tracking. */
export function equalWatchedValuesArrayFirstMapRefs(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new Map(), new Map(), "values-first");
}

/** Traverse from the last array index first, for common tail mutations. */
export function equalWatchedValuesArrayReverse(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new WeakMap(), new WeakMap(), "values-reverse");
}

/** Lazily promote first object pair to WeakMaps when traversing deeper. */
export function equalWatchedValuesLazyRefs(previous: unknown, current: unknown): boolean {
  if (typeof previous !== "object" || previous === null ||
      typeof current !== "object" || current === null) {
    return Object.is(previous, current);
  }
  return compare(previous, current, new LazyReferences(), new LazyReferences(), "keys-first");
}

export function equalWatchedValuesArrayFirstLazyRefs(previous: unknown, current: unknown): boolean {
  if (typeof previous !== "object" || previous === null ||
      typeof current !== "object" || current === null) {
    return Object.is(previous, current);
  }
  return compare(previous, current, new LazyReferences(), new LazyReferences(), "values-first");
}

function equalBytes(
  leftBuffer: ArrayBufferLike,
  leftOffset: number,
  rightBuffer: ArrayBufferLike,
  rightOffset: number,
  length: number,
): boolean {
  const words = Math.floor(length / 4);

  if ((leftOffset & 3) === 0 && (rightOffset & 3) === 0) {
    const a = new Uint32Array(leftBuffer, leftOffset, words);
    const b = new Uint32Array(rightBuffer, rightOffset, words);
    for (let i = 0; i < words; i++) {
      if (a[i] !== b[i]) return false;
    }
  } else {
    const a = new DataView(leftBuffer, leftOffset, length);
    const b = new DataView(rightBuffer, rightOffset, length);
    for (let i = 0; i < words; i++) {
      const offset = i * 4;
      if (a.getUint32(offset) !== b.getUint32(offset)) return false;
    }
  }

  const a = new Uint8Array(leftBuffer, leftOffset + words * 4, length - words * 4);
  const b = new Uint8Array(rightBuffer, rightOffset + words * 4, length - words * 4);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function compareProperties(
  left: object,
  right: object,
  leftToRight: References,
  rightToLeft: References,
  strategy: ArrayStrategy,
  leftKeys = Object.keys(left),
  rightKeys = Object.keys(right),
): boolean {
  if (leftKeys.length !== rightKeys.length) return false;

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  for (let i = 0; i < leftKeys.length; i++) {
    const key = leftKeys[i]!;
    if (!hasOwn.call(b, key) || !compare(a[key], b[key], leftToRight, rightToLeft, strategy)) {
      return false;
    }
  }
  return true;
}

function compare(
  left: unknown,
  right: unknown,
  leftToRight: References,
  rightToLeft: References,
  strategy: ArrayStrategy,
): boolean {
  if (typeof left !== "object" || left === null ||
      typeof right !== "object" || right === null) {
    return Object.is(left, right);
  }

  // Reference mappings are bidirectional: graph sharing is observable in the
  // inspector, and a one-way memo can miss alias changes.
  if (leftToRight.has(left)) return leftToRight.get(left) === right;
  if (rightToLeft.has(right)) return false;
  leftToRight.set(left, right);
  rightToLeft.set(right, left);

  if (left === right) return true;

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false;

    // Values-first is safe because we validate holes and enumerable extras
    // after comparing indices. It makes first-element changes very cheap.
    if (strategy === "values-first") {
      for (let i = 0; i < left.length; i++) {
        if (!compare(left[i], right[i], leftToRight, rightToLeft, strategy)) return false;
      }
    } else if (strategy === "values-reverse") {
      for (let i = left.length - 1; i >= 0; i--) {
        if (!compare(left[i], right[i], leftToRight, rightToLeft, strategy)) return false;
      }
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    // Object.keys reports array indices first, sorted numerically, then custom
    // enumerable keys. If exactly length keys exist and the final key is
    // length - 1, every index must be present and there can be no extra keys.
    // This avoids an Object.hasOwn call for every element.
    const lastIndex = String(left.length - 1);
    const dense = leftKeys.length === left.length &&
      rightKeys.length === right.length &&
      (left.length === 0 ||
        (leftKeys[left.length - 1] === lastIndex &&
         rightKeys[right.length - 1] === lastIndex));
    if (dense) {
      if (strategy === "keys-first") {
        for (let i = 0; i < left.length; i++) {
          if (!compare(left[i], right[i], leftToRight, rightToLeft, strategy)) return false;
        }
      }
      return true;
    }

    return compareProperties(left, right, leftToRight, rightToLeft, strategy, leftKeys, rightKeys);
  }
  if (Array.isArray(right)) return false;

  if (left instanceof Date) {
    return right instanceof Date && Object.is(left.getTime(), right.getTime());
  }
  if (left instanceof RegExp) {
    return right instanceof RegExp &&
      left.source === right.source && left.flags === right.flags;
  }
  if (left instanceof Map) {
    if (!(right instanceof Map) || left.size !== right.size) return false;
    const a = left.entries();
    const b = right.entries();
    for (let i = 0; i < left.size; i++) {
      const oldEntry = a.next().value!;
      const newEntry = b.next().value!;
      if (!compare(oldEntry[0], newEntry[0], leftToRight, rightToLeft, strategy) ||
          !compare(oldEntry[1], newEntry[1], leftToRight, rightToLeft, strategy)) {
        return false;
      }
    }
    return true;
  }
  if (left instanceof Set) {
    if (!(right instanceof Set) || left.size !== right.size) return false;
    const a = left.values();
    const b = right.values();
    for (let i = 0; i < left.size; i++) {
      if (!compare(a.next().value, b.next().value, leftToRight, rightToLeft, strategy)) {
        return false;
      }
    }
    return true;
  }
  if (left instanceof ArrayBuffer) {
    return right instanceof ArrayBuffer && left.byteLength === right.byteLength &&
      equalBytes(left, 0, right, 0, left.byteLength);
  }
  if (ArrayBuffer.isView(left)) {
    return ArrayBuffer.isView(right) &&
      left.constructor === right.constructor &&
      left.byteOffset === right.byteOffset &&
      left.byteLength === right.byteLength &&
      // structuredClone transfers the entire backing buffer, not just the view.
      // Comparing it also tracks aliasing between multiple views of one buffer.
      compare(left.buffer, right.buffer, leftToRight, rightToLeft, strategy);
  }
  if (left instanceof Error) {
    return right instanceof Error &&
      left.name === right.name &&
      left.message === right.message &&
      left.stack === right.stack &&
      compare(left.cause, right.cause, leftToRight, rightToLeft, strategy) &&
      compareProperties(left, right, leftToRight, rightToLeft, strategy);
  }

  // Plain objects dominate SugarCube state. Unsupported classes are conservatively
  // unequal, since structuredClone may discard internal state or prototypes.
  const leftPrototype: unknown = Object.getPrototypeOf(left);
  const rightPrototype: unknown = Object.getPrototypeOf(right);
  const leftPlain = leftPrototype === Object.prototype || leftPrototype === null;
  const rightPlain = rightPrototype === Object.prototype || rightPrototype === null;
  if (leftPlain && rightPlain) return compareProperties(left, right, leftToRight, rightToLeft, strategy);

  // Boxed primitives are supported by structuredClone.
  const tag = objectTag.call(left);
  if (tag !== objectTag.call(right)) return false;
  if (tag === "[object Number]" || tag === "[object Boolean]" ||
      tag === "[object String]" || tag === "[object BigInt]") {
    if (!Object.is(
      (left as { valueOf(): unknown }).valueOf(),
      (right as { valueOf(): unknown }).valueOf(),
    )) return false;
    return compareProperties(left, right, leftToRight, rightToLeft, strategy);
  }

  return false;
}
