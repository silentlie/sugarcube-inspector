#!/usr/bin/env node
/**
 * Actual Node worker_threads structured-clone round trips for experimental
 * watch polling strategies. No Chrome extension API is used here.
 * Run: npm run bench:watch:variants -- results.json
 */
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");
const { isDeepStrictEqual } = require("node:util");
const { serialize } = require("node:v8");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(js, filename);
};

const { ExperimentalWatchPoller } = require("../src/sugarcube/watchPollingVariants.ts");

function fixture(kind, size) {
  let value;
  let mutate;
  if (kind === "flat") {
    value = Object.fromEntries(Array.from({ length: size }, (_, i) => ["k" + i, i]));
    mutate = (i) => { value["k" + (i % size)]++; };
  } else if (kind === "nested") {
    const groups = Math.ceil(size / 100);
    value = Object.fromEntries(Array.from({ length: groups }, (_, g) => [
      "g" + g,
      Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["p" + i, g * 100 + i])),
    ]));
    mutate = (i) => { value["g" + (i % groups)]["p" + (i % 100)]++; };
  } else if (kind === "array") {
    value = Array.from({ length: size }, (_, i) => ({ id: i, score: i, active: true }));
    mutate = (i) => { value[i % size].score++; };
  } else if (kind === "map") {
    value = new Map(Array.from({ length: size }, (_, i) => ["key" + i, { score: i }]));
    mutate = (i) => { value.get("key" + (i % size)).score++; };
  } else if (kind === "primitive") {
    value = 0;
    mutate = () => { value++; };
  } else {
    throw new Error("Invalid scenario " + kind);
  }
  return { get value() { return value; }, mutate };
}

function stats(data) {
  const sorted = [...data].sort((a, b) => a - b);
  return {
    p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(3),
    p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(3),
    mean: +(data.reduce((a, b) => a + b, 0) / data.length).toFixed(3),
  };
}

if (!isMainThread) {
  const f = fixture(workerData.kind, workerData.size);
  const poller = new ExperimentalWatchPoller(workerData.mode, workerData.equality);
  parentPort.on("message", ({ type, i, mutate }) => {
    if (type === "final") {
      parentPort.postMessage({ type: "final", value: f.value });
      return;
    }
    if (mutate) f.mutate(i);
    const measurement = poller.poll(f.value);
    parentPort.postMessage({ type: "poll", measurement });
  });
  parentPort.postMessage({ type: "ready" });
} else {
  async function run(kind, size, changeEvery, rounds, mode, equality) {
    const worker = new Worker(__filename, { workerData: { kind, size, mode, equality } });
    let listener;
    worker.on("message", (message) => {
      const next = listener;
      listener = null;
      if (next) next(message);
    });
    function once() {
      return new Promise((resolve) => { listener = resolve; });
    }
    await once(); // ready
    let mirror;
    const samples = { roundTrip: [], main: [], compare: [], clone: [], overhead: [], responseBytes: [] };
    const poll = async (i, change, record) => {
      const started = performance.now();
      const resultPromise = once();
      worker.postMessage({ type: "poll", i, mutate: change });
      const { measurement } = await resultPromise;
      if (measurement.changed) mirror = measurement.value;
      const duration = performance.now() - started;
      if (record) {
        samples.roundTrip.push(duration);
        samples.main.push(measurement.mainMs);
        samples.compare.push(measurement.compareMs);
        samples.clone.push(measurement.cloneMs);
        samples.overhead.push(duration - measurement.mainMs);
        samples.responseBytes.push(serialize(measurement).byteLength);
      }
    };
    for (let i = 0; i < 20; i++) await poll(i, false, false);
    for (let i = 1; i <= rounds; i++) {
      await poll(i, changeEvery > 0 && i % changeEvery === 0, true);
    }
    const finalPromise = once();
    worker.postMessage({ type: "final" });
    const final = await finalPromise;
    await worker.terminate();
    if (!isDeepStrictEqual(mirror, final.value)) {
      throw new Error("Inspector cache desynchronized: " + [kind,mode,equality].join("/"));
    }

    return {
      kind, size, changeEvery, rounds, mode, equality,
      roundTripMs: stats(samples.roundTrip),
      mainMs: stats(samples.main),
      compareMs: stats(samples.compare),
      cloneMs: stats(samples.clone),
      messagingOverheadMs: stats(samples.overhead),
      responseBytes: stats(samples.responseBytes),
      consistent: true,
    };
  }

  async function main() {
    const scenarios = [
      ["flat", 10000, 0, 60],
      ["flat", 10000, 1, 60],
      ["nested", 10000, 0, 60],
      ["nested", 10000, 1, 60],
      ["array", 10000, 0, 60],
      ["array", 10000, 1, 60],
      ["map", 2000, 0, 60],
      ["map", 2000, 1, 60],
      ["primitive", 1, 1, 100],
    ];
    const strategies = [
      ["compare-first", "keys-weak"],
      ["compare-first", "arrays-weak"],
      ["compare-first", "keys-map"],
      ["compare-first", "arrays-map"],
      ["compare-first", "keys-lazy"],
      ["compare-first", "arrays-lazy"],
      ["compare-first", "arrays-reverse"],
      ["clone-first", "keys-weak"],
      ["always-clone", "keys-weak"],
    ];
    const results = [];
    for (const [kind, size, changeEvery, rounds] of scenarios) {
      for (const [mode, equality] of strategies) {
        const result = await run(kind, size, changeEvery, rounds, mode, equality);
        results.push(result);
        console.log(
          kind, size, changeEvery ? "mutating" : "static",
          mode, equality, "MAIN " + result.mainMs.p50 + " ms",
          "ROUND " + result.roundTripMs.p50 + " ms",
        );
      }
    }
    const data = {
      node: process.version, platform: process.platform,
      transport: "real async Node worker_threads structured-clone messages",
      disclaimer: "This is not the Chromium custom-event RPC.",
      results,
    };
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(data, null, 2) + "\n");
    console.log("Passed", results.length, "cache consistency cases.");
  }
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
