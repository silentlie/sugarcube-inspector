import { readFile, writeFile } from "node:fs/promises";

const [baselinePath, numericPath, outputPath] = process.argv.slice(2);
if (!baselinePath || !numericPath || !outputPath) {
  throw new Error("Usage: node scripts/compare-tree-id-benchmarks.mjs baseline.json numeric.json output.md");
}

const [baseline, numeric] = await Promise.all(
  [baselinePath, numericPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
if (baseline.repeats !== numeric.repeats ||
    JSON.stringify(baseline.sizes) !== JSON.stringify(numeric.sizes)) {
  throw new Error("A/B runs must use the same sizes and repetition count");
}

const baselineByCase = new Map(baseline.summary.map((row) => [row.size + ":" + row.scenario, row]));
const fields = [
  ["medianTaskMs", "Task ms"],
  ["medianScriptMs", "Script ms"],
  ["medianNamedExclusiveMs", "Named functions ms"],
  ["medianWorstFrameMs", "Worst frame ms"],
];

const pct = (original, changed) =>
  original === 0 ? "n/a" : ((changed / original - 1) * 100).toFixed(1) + "%";
const fmt = (value) => value == null ? "n/a" : value.toFixed(1);

const lines = [
  "# Numeric tree IDs: browser A/B",
  "",
  "Baseline: `" + baseline.commit + "` · numeric: `" + numeric.commit + "`.",
  "Headless Chromium, " + baseline.repeats + " repetitions per root size / scenario.",
  "Times are medians in milliseconds, not direct measures of desktop FPS.",
  "Negative delta means numeric IDs measured faster. Percentages are computed from rounded medians.",
  "",
  "| Scenario | Roots | Metric | String ID | Numeric ID | Change |",
  "|---|---:|---|---:|---:|---:|",
];

for (const row of numeric.summary) {
  const key = row.size + ":" + row.scenario;
  const old = baselineByCase.get(key);
  if (!old) throw new Error("Missing baseline for " + key);
  for (const [field, label] of fields) {
    lines.push("| " + row.scenario + " | " + row.size + " | " + label + " | " +
      fmt(old[field]) + " | " + fmt(row[field]) + " | " +
      (old[field] != null && row[field] != null ? pct(old[field], row[field]) : "n/a") + " |");
  }
  const oldIds = old.stages?.["Child discovery / ID"];
  const newIds = row.stages?.["Child discovery / ID"];
  lines.push("| " + row.scenario + " | " + row.size + " | Child discovery / ID ms | " +
    fmt(oldIds) + " | " + fmt(newIds) + " | " +
    (oldIds != null && newIds != null ? pct(oldIds, newIds) : "n/a") + " |");
}

lines.push(
  "",
  "Measurement caveats: the baseline instruments getLocationId and the new version",
  "instruments getChildId; totals include shared child discovery. Browser counters",
  "cover a time window including overhead and other work. Runs are sequential,",
  "not alternating, so runner drift and noise may affect small differences.",
);
await writeFile(outputPath, lines.join("\n") + "\n");
console.log(lines.join("\n"));
