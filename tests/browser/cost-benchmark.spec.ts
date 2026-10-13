import { mkdir, writeFile } from "node:fs/promises";
import { expect, storyUrl, test } from "./fixtures";

type Stat = { calls: number; totalMs: number; maxMs: number };
type Period = {
  cold: boolean;
  maxFrameGapMs: number;
  estimatedMissedFrames: number;
  treeRows: number;
  stats: Record<string, Stat>;
};
type Result = { variant: string; frameBudgetMs: number; periods: Period[] };
type Suite = { mode: string; results: Result[] };
type API = { runAll(options: {cycles: number; sampleMs: number; settleMs: number}): Promise<Suite> };
const variants = [
  "normal", "destroyOnHidden", "noTree", "noAnt", "plainRows", "staticRows",
  "noPrism", "noRowVisibility", "stableWatchers", "stableTreeData",
  "noRootWatch", "noRowWatch",
];

test.skip(process.env.SC_INSPECTOR_COST_TEST !== "1", "Run only in cost benchmark workflow.");

for (const size of [200, 2000]) {
  test(`compare inspection costs with ${size} root variables`, async ({page}) => {
    test.setTimeout(240_000);
    await page.goto(storyUrl);
    await page.evaluate((count) => {
      const cube = (globalThis as typeof globalThis & {
        SugarCube?: { State: { variables: Record<string, unknown> } }
      }).SugarCube;
      if (!cube?.State) throw new Error("SugarCube.State not available");
      const store = cube.State.variables;
      for (let i = 0; i < count; i++) {
        store["costBench" + i] = i % 3 === 0 ? { index: i, nested: [i, i + 1] } :
          i % 3 === 1 ? "string value " + i : i;
      }
    }, size);
    const inspector = page.locator("sugarcube-inspector");
    const handle = inspector.getByRole("button", {name: "Resize SugarCube Inspector"});
    await handle.press("Enter");
    await handle.hover();
    await expect(inspector.getByRole("tab", {name: "Overview"}))
      .toHaveAttribute("aria-selected", "true");
    await page.waitForFunction(() => typeof (window as typeof window & {scInspectorBench?: API})
      .scInspectorBench !== "undefined");
    const suite = await page.evaluate(async () =>
      await (window as typeof window & {scInspectorBench?: API}).scInspectorBench!.runAll({
        cycles: 5, sampleMs: 450, settleMs: 160,
      }));
    expect(suite.results.map((item) => item.variant)).toEqual(variants);
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const median = (arr: number[]) => {
      const values = [...arr].sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)] ?? 0;
    };
    const summary = suite.results.map((item) => {
      const warm = item.periods.filter((p) => !p.cold);
      const cost = (key: string, field: keyof Stat) => mean(
        warm.map((p) => p.stats[key]?.[field] ?? 0));
      return {
        variant: item.variant,
        rootCount: size,
        frameBudgetMs: item.frameBudgetMs,
        warmSwitches: warm.length,
        coldSwitches: item.periods.length - warm.length,
        medianWarmWorstFrameMs: median(warm.map((p) => p.maxFrameGapMs)),
        maxWarmWorstFrameMs: Math.max(0, ...warm.map((p) => p.maxFrameGapMs)),
        medianColdWorstFrameMs: median(item.periods.filter((p) => p.cold).map(
          (p) => p.maxFrameGapMs)),
        meanWarmMissedFrames: mean(warm.map((p) => p.estimatedMissedFrames)),
        meanWatchReadsMs: cost("watch.read", "totalMs"),
        meanVariableReadMs: cost("variable.read", "totalMs"),
        meanTreeInitialMs: cost("tree.initial", "totalMs"),
        meanRootReconcileMs: cost("tree.rootReconcile", "totalMs"),
        meanWatchCreateCount: cost("watch.create", "calls"),
        meanRowRenderCount: cost("row.render", "calls"),
        meanTitleRenderCount: cost("tree.titleRender", "calls"),
        meanWatchChangeCount: cost("watch.changed", "calls"),
        meanTreeRows: mean(warm.map((p) => p.treeRows)),
      };
    });
    await mkdir("test-results", {recursive: true});
    await writeFile(`test-results/inspection-cost-${size}.json`,
      JSON.stringify({size, summary, suite}, null, 2));
    console.log("COST_BENCH_SUMMARY=" + JSON.stringify({size, summary}));
  });
}
