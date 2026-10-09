/**
 * Experimental fail-fast comparator for structured-clone-compatible watch values.
 *
 * A false positive just causes an extra refresh; a false negative leaves stale UI.
 * Intentionally treats reordered Map/Set entries and unsupported objects as changed.
 * Keep this separate from the production WatchService until benchmarking is complete.
 */
const hasOwn = Object.prototype.hasOwnProperty;
const objectTag = Object.prototype.toString;

type References = WeakMap<object, object>;

export function equalWatchedValues(previous: unknown, current: unknown): boolean {
  return compare(previous, current, new WeakMap(), new WeakMap());
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
  leftKeys = Object.keys(left),
  rightKeys = Object.keys(right),
): boolean {
  if (leftKeys.length !== rightKeys.length) return false;

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  for (let i = 0; i < leftKeys.length; i++) {
    const key = leftKeys[i]!;
    if (!hasOwn.call(b, key) || !compare(a[key], b[key], leftToRight, rightToLeft)) {
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

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    // Dense, ordinary arrays: index loop rather than property recursion.
    // Verify own indices to avoid mistaking holes plus custom keys for dense.
    if (leftKeys.length === left.length && rightKeys.length === right.length) {
      let dense = true;
      for (let i = 0; i < left.length; i++) {
        if (!hasOwn.call(left, i) || !hasOwn.call(right, i)) {
          dense = false;
          break;
        }
        if (!compare(left[i], right[i], leftToRight, rightToLeft)) return false;
      }
      if (dense) return true;
    }

    return compareProperties(left, right, leftToRight, rightToLeft, leftKeys, rightKeys);
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
      if (!compare(oldEntry[0], newEntry[0], leftToRight, rightToLeft) ||
          !compare(oldEntry[1], newEntry[1], leftToRight, rightToLeft)) {
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
      if (!compare(a.next().value, b.next().value, leftToRight, rightToLeft)) {
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
      compare(left.buffer, right.buffer, leftToRight, rightToLeft);
  }
  if (left instanceof Error) {
    return right instanceof Error &&
      left.name === right.name &&
      left.message === right.message &&
      left.stack === right.stack &&
      compare(left.cause, right.cause, leftToRight, rightToLeft) &&
      compareProperties(left, right, leftToRight, rightToLeft);
  }

  // Plain objects dominate SugarCube state. Unsupported classes are conservatively
  // unequal, since structuredClone may discard internal state or prototypes.
  const leftPrototype: unknown = Object.getPrototypeOf(left);
  const rightPrototype: unknown = Object.getPrototypeOf(right);
  const leftPlain = leftPrototype === Object.prototype || leftPrototype === null;
  const rightPlain = rightPrototype === Object.prototype || rightPrototype === null;
  if (leftPlain && rightPlain) return compareProperties(left, right, leftToRight, rightToLeft);

  // Boxed primitives are supported by structuredClone.
  const tag = objectTag.call(left);
  if (tag !== objectTag.call(right)) return false;
  if (tag === "[object Number]" || tag === "[object Boolean]" ||
      tag === "[object String]" || tag === "[object BigInt]") {
    if (!Object.is(
      (left as { valueOf(): unknown }).valueOf(),
      (right as { valueOf(): unknown }).valueOf(),
    )) return false;
    return compareProperties(left, right, leftToRight, rightToLeft);
  }

  return false;
}
