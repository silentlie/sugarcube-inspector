#!/usr/bin/env node
/* Compare the production WatchService with clone-and-send.
 * Run: npm run bench:watch
 * Times are Node/V8 microbenchmarks, not Chrome RPC measurements.
 */
const { performance } = require("node:perf_hooks");
const { serialize } = require("node:v8");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load the actual repository TypeScript source without building WXT.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(javascript, filename);
};

const { WatchService } = require("../src/sugarcube/watchService.ts");
const { minimizeWatchTargets } = require("../src/sugarcube/watch.ts");

function target(parts) {
  return {
    scope: "story",
    path: parts.map((key) =>
      typeof key === "number"
        ? { type: "index", index: key }
        : { type: "property", key },
    ),
  };
}

function read(stores, watch) {
  let value = stores[watch.scope];
  for (const part of watch.path) {
    const key = part.type === "index" ? part.index : part.key;
    if (value == null || !Object.hasOwn(value, key)) {
      return { ...watch, missing: true };
    }
    value = value[key];
  }
  return { ...watch, value: structuredClone(value) };
}

function cloneOnly(stores, targets) {
  return {
    values: minimizeWatchTargets(targets).map((watch) => read(stores, watch)),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fixture(kind, size) {
  const stores = { story: {}, temporary: {} };
  let targets = [target(["watched"])];
  let mutate;
  if (kind === "flat") {
    stores.story.watched = Object.fromEntries(
      Array.from({ length: size }, (_, i) => ["k" + i, i]),
    );
    mutate = (i) => { stores.story.watched["k" + (i % size)]++; };
  } else if (kind === "nested") {
    const groups = Math.ceil(size / 100);
    stores.story.watched = Object.fromEntries(
      Array.from({ length: groups }, (_, g) => [
        "group" + g,
        Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["v" + i, g * 100 + i])),
      ]),
    );
    mutate = (i) => { stores.story.watched["group" + (i % groups)]["v" + (i % 100)]++; };
  } else if (kind === "array") {
    stores.story.watched = Array.from(
      { length: size }, (_, i) => ({ id: i, score: i, active: true }),
    );
    mutate = (i) => { stores.story.watched[i % size].score++; };
  } else if (kind === "map") {
    stores.story.watched = new Map(
      Array.from({ length: size }, (_, i) => ["key" + i, { score: i }]),
    );
    mutate = (i) => { stores.story.watched.get("key" + (i % size)).score++; };
  } else if (kind === "leaves") {
    stores.story = Object.fromEntries(
      Array.from({ length: size }, (_, i) => ["k" + i, i]),
    );
    targets = Array.from({ length: size }, (_, i) => target(["k" + i]));
    mutate = (i) => { stores.story["k" + (i % size)]++; };
  }
  return { stores, targets, mutate };
}

function benchmark(kind, size, mutateEvery, rounds) {
  const { stores, targets, mutate } = fixture(kind, size);
  const service = new WatchService();
  let revision = 0;
  let iteration = 0;
  const results = {
    diff: { main: [], total: [], bytes: [] },
    clone: { main: [], total: [], bytes: [] },
  };

  function tick(record) {
    iteration++;
    if (mutateEvery > 0 && iteration % mutateEvery === 0) mutate(iteration);

    const request = { session: "bench", revision, targets };
    let started = performance.now();
    const diffResult = service.poll(request, stores);
    const diffMain = performance.now() - started;
    started = performance.now();
    structuredClone(diffResult); // Approximate one RPC response copy.
    const diffTransport = performance.now() - started;
    revision = diffResult.revision;

    started = performance.now();
    const cloneResult = cloneOnly(stores, targets);
    const cloneMain = performance.now() - started;
    started = performance.now();
    structuredClone(cloneResult);
    const cloneTransport = performance.now() - started;

    if (record) {
      results.diff.main.push(diffMain);
      results.diff.total.push(diffMain + diffTransport);
      results.diff.bytes.push(serialize(diffResult).byteLength);
      results.clone.main.push(cloneMain);
      results.clone.total.push(cloneMain + cloneTransport);
      results.clone.bytes.push(serialize(cloneResult).byteLength);
    }
  }

  for (let i = 0; i < 20; i++) tick(false); // JIT warmup and watch baseline
  for (let i = 0; i < rounds; i++) tick(true);

  return {
    scenario: kind, size, mutateEvery,
    diffMainMs: median(results.diff.main),
    cloneMainMs: median(results.clone.main),
    diffWithTransferMs: median(results.diff.total),
    cloneWithTransferMs: median(results.clone.total),
    diffBytes: median(results.diff.bytes),
    cloneBytes: median(results.clone.bytes),
  };
}

const cases = [
  ["flat", 1000, 0, 250],
  ["flat", 10000, 0, 100],
  ["flat", 10000, 1, 100],
  ["nested", 10000, 0, 100],
  ["nested", 10000, 1, 100],
  ["array", 10000, 1, 100],
  ["map", 3000, 1, 100],
  ["leaves", 100, 1, 100],
];

console.log("Node " + process.version + ", " + process.platform);
console.log("Times are median ms/poll; withTransfer simulates structuredClone(response).");
for (const args of cases) {
  const r = benchmark(...args);
  console.log(
    [
      r.scenario.padEnd(6), String(r.size).padStart(5),
      r.mutateEvery ? "changed" : "static ",
      "MAIN diff=" + r.diffMainMs.toFixed(2) + " clone=" + r.cloneMainMs.toFixed(2),
      "WITH COPY diff=" + r.diffWithTransferMs.toFixed(2) + " clone=" + r.cloneWithTransferMs.toFixed(2),
      "BYTES diff=" + r.diffBytes + " clone=" + r.cloneBytes,
    ].join(" | "),
  );
}
