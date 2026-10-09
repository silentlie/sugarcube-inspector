#!/usr/bin/env node
/**
 * Compare change detectors on structuredClone-compatible SugarCube-style values.
 *
 * First install benchmark-only dependencies, without changing package-lock:
 * npm install --no-save --package-lock=false --ignore-scripts fast-equals@6.1.1 fast-deep-equal@3.1.3 dequal@2.0.3
 * Then:
 * node scripts/bench-watch-equality.cjs [results.json]
 *
 * Measures deep equality alone and equality -> clone if changed -> response
 * structuredClone -> inspector replacement. Not a browser RPC benchmark.
 */
const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const text = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(js, filename);
};

const { deepEqual: projectEqual } = require("../src/sugarcube/watchService.ts");
const {
  equalWatchedValues: optimizedEqual,
  equalWatchedValuesArrayFirst,
  equalWatchedValuesMapRefs,
  equalWatchedValuesArrayFirstMapRefs,
} = require("../src/sugarcube/watchEqual.ts");
const {
  deepEqual: fastEquals,
  circularDeepEqual: fastEqualsCircular,
} = require("fast-equals");
const fastDeepEqual = require("fast-deep-equal/es6");
const { dequal } = require("dequal");

/**
 * Fail-fast equality for structured-clone-compatible variable values.
 * Early exit on first mismatch, no patch generation, no intermediate arrays
 * for ordinary objects/arrays. Iteration order is significant for Map/Set.
 * Use pair tracking to tolerate cycles; verify correctness before timing.
 */
function failFastEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;

  let mapped = seen.get(a);
  if (mapped !== undefined) return mapped === b;
  seen.set(a, b);

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    // Arrays can contain holes or additional enumerable keys.
  } else if (a instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  } else if (a instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  } else if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) {
    if (a.constructor !== b.constructor) return false;
    const av = a instanceof ArrayBuffer ? new Uint8Array(a) :
      new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bv = b instanceof ArrayBuffer ? new Uint8Array(b) :
      new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
    return true;
  } else if (a instanceof Map) {
    if (a.size !== b.size) return false;
    const left = a.entries();
    const right = b.entries();
    for (let i = 0; i < a.size; i++) {
      const ae = left.next().value;
      const be = right.next().value;
      if (!failFastEqual(ae[0], be[0], seen) || !failFastEqual(ae[1], be[1], seen)) {
        return false;
      }
    }
    return true;
  } else if (a instanceof Set) {
    if (a.size !== b.size) return false;
    const left = a.values();
    const right = b.values();
    for (let i = 0; i < a.size; i++) {
      if (!failFastEqual(left.next().value, right.next().value, seen)) return false;
    }
    return true;
  } else if (a instanceof Error) {
    return a.name === b.name && a.message === b.message;
  }

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!failFastEqual(a[key], b[key], seen)) return false;
  }
  return true;
}

const detectors = {
  "project deepEqual": projectEqual,
  "fast-equals/deepEqual": fastEquals,
  "fast-equals/circular": fastEqualsCircular,
  "fast-deep-equal/es6": fastDeepEqual,
  "dequal": dequal,
  "custom fail-fast (previous)": failFastEqual,
  "custom fail-fast (optimized)": optimizedEqual,
  "array-first WeakMap": equalWatchedValuesArrayFirst,
  "keys-first Map": equalWatchedValuesMapRefs,
  "array-first Map": equalWatchedValuesArrayFirstMapRefs,
};

function fixture(kind, size) {
  let value;
  let modify;
  if (kind === "flat") {
    value = Object.fromEntries(Array.from({ length: size }, (_, i) => ["k" + i, i]));
    modify = (v, index) => { v["k" + index]++; };
  } else if (kind === "nested") {
    const groups = Math.ceil(size / 100);
    value = Object.fromEntries(Array.from({ length: groups }, (_, group) => [
      "g" + group,
      Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["p" + i, i])),
    ]));
    modify = (v, index) => { v["g" + Math.floor(index / 100)]["p" + index % 100]++; };
  } else if (kind === "array") {
    value = Array.from({ length: size }, (_, i) => ({ id: i, score: i, active: true }));
    modify = (v, index) => { v[index].score++; };
  } else if (kind === "map") {
    value = new Map(Array.from({ length: size }, (_, i) => ["k" + i, { score: i }]));
    modify = (v, index) => { v.get("k" + index).score++; };
  } else if (kind === "mapObjectKeys") {
    value = new Map(Array.from({ length: size }, (_, i) => [{ id: i }, { score: i }]));
    modify = (v, index) => { [...v.values()][index].score++; };
  } else if (kind === "setObjects") {
    value = new Set(Array.from({ length: size }, (_, i) => ({ id: i, score: i })));
    modify = (v, index) => { [...v][index].score++; };
  } else if (kind === "typed") {
    value = new Uint8Array(size);
    for (let i = 0; i < size; i++) value[i] = i % 251;
    modify = (v, index) => { v[index] = (v[index] + 1) % 256; };
  } else if (kind === "cyclic") {
    value = { nodes: Array.from({ length: size }, (_, i) => ({ id: i, score: i })) };
    value.self = value;
    modify = (v, index) => { v.nodes[index].score++; };
  } else {
    throw new Error("Unknown fixture: " + kind);
  }
  return { value, modify };
}

function quantile(arr, ratio) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}
function measure(fn, repetitions) {
  for (let i = 0; i < 12; i++) fn();
  const samples = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    for (let i = 0; i < repetitions; i++) fn();
    samples.push((performance.now() - start) / repetitions);
  }
  return +quantile(samples, 0.5).toFixed(5);
}

function baselineFullSend(next) {
  const copied = structuredClone(next);
  const received = structuredClone({ value: copied });
  return received.value;
}

function detectThenSend(comparator, previous, next) {
  if (comparator(previous, next)) return previous;
  return baselineFullSend(next);
}

function benchmark(kind, size, changeAt, repetitions) {
  const { value, modify } = fixture(kind, size);
  const previous = structuredClone(value);
  const current = structuredClone(value);
  const changed = changeAt !== "none";
  if (changed) {
    const index = changeAt === "first" ? 0 : changeAt === "middle"
      ? Math.floor(size / 2) : size - 1;
    modify(current, index);
  }

  const alwaysFull = measure(() => baselineFullSend(current), repetitions);
  const records = [];

  for (const [name, comparator] of Object.entries(detectors)) {
    let actualEqual;
    let actualChanged;
    let failure;
    try {
      // Test cloned inputs, not same-object reference shortcuts.
      actualEqual = comparator(previous, structuredClone(previous));
      actualChanged = comparator(previous, current);
      if (actualEqual !== true || actualChanged !== !changed) {
        failure = "incorrect equality result";
      }
    } catch (error) {
      failure = error instanceof Error ? error.name + ": " + error.message : String(error);
    }

    if (failure) {
      records.push({ detector: name, supported: false, reason: failure });
      continue;
    }

    const compareMs = measure(() => comparator(previous, current), repetitions);
    const detectAndSendMs = measure(
      () => detectThenSend(comparator, previous, current), repetitions,
    );
    records.push({
      detector: name, supported: true,
      compareMs, detectAndSendMs,
      alwaysFullSendMs: alwaysFull,
      speedup: +(alwaysFull / detectAndSendMs).toFixed(2),
    });
  }

  return { kind, size, changeAt, repetitions, alwaysFullSendMs: alwaysFull, results: records };
}

const cases = [
  ["flat", 1000, "none", 100],
  ["flat", 1000, "first", 100],
  ["flat", 10000, "none", 25],
  ["flat", 10000, "first", 25],
  ["flat", 10000, "last", 25],
  ["nested", 10000, "none", 25],
  ["nested", 10000, "first", 25],
  ["nested", 10000, "last", 25],
  ["array", 10000, "none", 25],
  ["array", 10000, "first", 25],
  ["array", 10000, "last", 25],
  ["map", 2000, "none", 25],
  ["map", 2000, "last", 25],
  ["mapObjectKeys", 200, "none", 12],
  ["mapObjectKeys", 200, "last", 12],
  ["setObjects", 200, "none", 12],
  ["setObjects", 200, "last", 12],
  ["typed", 200000, "none", 35],
  ["typed", 200000, "last", 35],
  ["cyclic", 1000, "none", 20],
  ["cyclic", 1000, "last", 20],
];

const output = {
  platform: process.platform, node: process.version, v8: process.versions.v8,
  description: "Direct equality and equality + structuredClone-on-change + simulated response structuredClone.",
  limitation: "Single-threaded copying, not actual Chromium RPC or asynchronous worker messages.",
  versions: {
    "fast-equals": "6.1.1",
    "fast-deep-equal": "3.1.3",
    "dequal": "2.0.3",
  },
  cases: [],
};

for (const args of cases) {
  const row = benchmark(...args);
  output.cases.push(row);
  const allowed = row.results.filter((r) => r.supported);
  const ranked = [...allowed].sort((a, b) => a.detectAndSendMs - b.detectAndSendMs);
  console.log(
    row.kind.padEnd(14), String(row.size).padStart(6),
    row.changeAt.padEnd(5), "always=" + row.alwaysFullSendMs.toFixed(3) + "ms",
    "winner=" + ranked[0].detector + "(" + ranked[0].detectAndSendMs.toFixed(3) + "ms)",
    "unsupported=" + row.results.filter((r) => !r.supported).map((r) => r.detector).join(","),
  );
}
if (process.argv[2]) {
  fs.writeFileSync(process.argv[2], JSON.stringify(output, null, 2) + "\n");
}
console.log("Finished", output.cases.length, "scenarios; unsupported/incorrect detectors were excluded per scenario.");
