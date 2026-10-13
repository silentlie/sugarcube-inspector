import { expect, storyUrl, test } from "./fixtures";

type BenchReport = {
  mode: string;
  frameBudgetMs: number;
  periods: {
    maxFrameGapMs: number;
    cold: boolean;
    stats: Record<string, {calls:number;totalMs:number;maxMs:number}>;
  }[];
};
type API = {
  run(options?: {cycles?:number; sampleMs?:number; settleMs?:number; variant?:string}):Promise<BenchReport>;
  record(options?: {seconds?:number}):Promise<BenchReport>;
  export():string;
  last:BenchReport | null;
};
test.skip(process.env.SC_INSPECTOR_BENCHMARK_TEST !== "1", "Requires opt-in benchmark build.");

test("opt-in benchmark build profiles tab switches in the MAIN world", async ({page}) => {
  test.setTimeout(20_000);
  await page.goto(storyUrl);
  const inspector = page.locator("sugarcube-inspector");
  const handle = inspector.getByRole("button", {name:"Resize SugarCube Inspector"});
  await handle.press("Enter");
  await handle.hover();
  await expect(inspector.getByRole("tab",{name:"Overview"})).toHaveAttribute("aria-selected","true");
  await page.waitForFunction(() => typeof (window as typeof window & {scInspectorBench?:API}).scInspectorBench !== "undefined");
  const report = await page.evaluate(async () =>
    await (window as typeof window & {scInspectorBench?:API}).scInspectorBench!.run({cycles:2,sampleMs:160,settleMs:80}));
  expect(report.mode).toBe("auto");
  expect(report.frameBudgetMs).toBeGreaterThan(0);
  expect(report.periods).toHaveLength(2);
  expect(report.periods[0]!.maxFrameGapMs).toBeGreaterThan(0);
  expect(report.periods[0]!.stats["tree.initial"]?.calls).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as typeof window & {scInspectorBench?:API}).scInspectorBench!.export())).toContain("maxFrameGapMs");
  await expect(inspector.getByRole("tab",{name:"Overview"}))
    .toHaveAttribute("aria-selected","true");

  const recording = page.evaluate(async () =>
    await (window as typeof window & {scInspectorBench?:API}).scInspectorBench!.record({seconds:2}));
  await page.waitForTimeout(350);
  await inspector.getByRole("tab",{name:"Variables",exact:true}).click();
  await page.waitForTimeout(220);
  await inspector.getByRole("tab",{name:"Scripts"}).click();
  const manual = await recording;
  expect(manual.mode).toBe("manual");
  expect(manual.periods.length).toBeGreaterThanOrEqual(2);
  expect(manual.periods.every(p => p.maxFrameGapMs > 0)).toBe(true);
});


test("destroyOnHidden measures a fresh tree mount on every Variables visit", async ({page}) => {
  test.setTimeout(20_000);
  await page.goto(storyUrl);
  const inspector = page.locator("sugarcube-inspector");
  const handle = inspector.getByRole("button", {name:"Resize SugarCube Inspector"});
  await handle.press("Enter");
  await handle.hover();
  await page.waitForFunction(() => typeof (window as typeof window & {scInspectorBench?:API}).scInspectorBench !== "undefined");

  const destroyed = await page.evaluate(async () =>
    await (window as typeof window & {scInspectorBench?:API}).scInspectorBench!.run({
      variant:"destroyOnHidden", cycles:3, sampleMs:160, settleMs:80,
    }));
  expect(destroyed.periods.map(period => period.cold)).toEqual([true, true, true]);
  expect(destroyed.periods.every(period => (period.stats["tree.initial"]?.calls ?? 0) > 0)).toBe(true);

  // The benchmark must restore the retained-tree behavior after it finishes.
  const retained = await page.evaluate(async () =>
    await (window as typeof window & {scInspectorBench?:API}).scInspectorBench!.run({
      cycles:2, sampleMs:160, settleMs:80,
    }));
  expect(retained.periods.map(period => period.cold)).toEqual([true, false]);
});
