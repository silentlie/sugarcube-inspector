import type {} from "twine-sugarcube";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, storyUrl, test } from "./fixtures";

/**
 * Temporary real-browser scroll benchmark. Run with SCROLL_BENCH=1.
 * This is diagnostic, not a pass/fail performance assertion.
 */
test.skip(!process.env.SCROLL_BENCH && !process.env.CI, "Run only for the scroll benchmark");

type Mode = { label: string; plain: boolean; pauseWatch: boolean };
const modes: Mode[] = [
  { label: "baseline", plain: false, pauseWatch: false },
  { label: "plain-text", plain: true, pauseWatch: false },
  { label: "polling-paused", plain: false, pauseWatch: true },
  { label: "plain-and-paused", plain: true, pauseWatch: true },
];

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1]!;
}

function metricDelta(
  before: { metrics: { name: string; value: number }[] },
  after: { metrics: { name: string; value: number }[] },
) {
  const first = new Map(before.metrics.map((metric) => [metric.name, metric.value]));
  const last = new Map(after.metrics.map((metric) => [metric.name, metric.value]));
  const result: Record<string, number> = {};
  // CDP duration metrics are in seconds.
  for (const name of ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]) {
    if (first.has(name) && last.has(name)) {
      result[name + "Ms"] = 1000 * (last.get(name)! - first.get(name)!);
    }
  }
  return result;
}

test("scroll cost: mounted rows, Prism and polling", async ({ context }) => {
  test.setTimeout(300_000);
  const results: Record<string, unknown>[] = [];
  // Three repetitions with the middle pass reversed to reduce ordering bias.
  const orders = [modes, [...modes].reverse(), modes];

  for (const [cycle, order] of orders.entries()) {
    for (const mode of order) {
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width: 1450, height: 900 });
        await page.addInitScript(({ plain, pauseWatch }) => {
          const flags = window as typeof window & {
            __SCROLL_BENCH_PLAIN__?: boolean;
            __SCROLL_BENCH_PAUSE_WATCH__?: boolean;
          };
          flags.__SCROLL_BENCH_PLAIN__ = plain;
          flags.__SCROLL_BENCH_PAUSE_WATCH__ = pauseWatch;
        }, mode);
        await page.goto(storyUrl);
        await expect(page.locator("#passages")).toContainText("Smoke story ready.");

        await page.evaluate(() => {
          const values = SugarCube.State.variables as unknown as Record<string, unknown>;
          for (let index = 0; index < 1800; index++) {
            values["scroll_bench_" + String(index).padStart(4, "0")] =
              "escaped string \"value\" " + index;
          }
        });

        const drawer = page.locator("sugarcube-inspector");
        await expect(drawer).toHaveCount(1);
        await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
        await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
        const holder = drawer.getByRole("tree", { name: "Story variables tree" })
          .locator(".ant-tree-list-holder");
        await expect.poll(() => holder.evaluate((element) =>
          element.scrollHeight > element.clientHeight * 6)).toBe(true);
        await page.waitForTimeout(400);

        const session = await context.newCDPSession(page);
        await session.send("Performance.enable");

        async function sample(kind: "idle" | "scroll") {
          const before = await session.send("Performance.getMetrics");
          const frames = await holder.evaluate(async (element, sampling) => {
            const list = element as HTMLElement;
            list.scrollTop = 0;
            const distance = list.scrollHeight - list.clientHeight;
            const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
            await raf();
            await raf();

            const deltas: number[] = [];
            let rowAdds = 0;
            let longTaskMs = 0;
            const mutations = new MutationObserver((records) => {
              for (const record of records) {
                for (const added of record.addedNodes) {
                  if (!(added instanceof Element)) continue;
                  if (added.matches(".ant-tree-treenode")) rowAdds++;
                  rowAdds += added.querySelectorAll(".ant-tree-treenode").length;
                }
              }
            });
            mutations.observe(list, { subtree: true, childList: true });

            const longTasks = new PerformanceObserver((records) => {
              for (const entry of records.getEntries()) longTaskMs += entry.duration;
            });
            if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
              longTasks.observe({ type: "longtask" });
            }
            let last = await raf();
            const started = performance.now();
            const steps = sampling === "idle" ? 90 : 160;
            for (let i = 1; i <= steps; i++) {
              const now = await raf();
              deltas.push(now - last);
              last = now;
              if (sampling === "scroll") list.scrollTop = distance * i / steps;
            }
            const elapsedMs = performance.now() - started;
            mutations.disconnect();
            longTasks.disconnect();
            return { deltas, rowAdds, longTaskMs, elapsedMs, distance };
          }, kind);
          const after = await session.send("Performance.getMetrics");
          return {
            elapsedMs: Math.round(frames.elapsedMs),
            p50FrameMs: percentile(frames.deltas, 0.5),
            p95FrameMs: percentile(frames.deltas, 0.95),
            p99FrameMs: percentile(frames.deltas, 0.99),
            framesOver25Ms: frames.deltas.filter((ms) => ms > 25).length,
            framesOver33Ms: frames.deltas.filter((ms) => ms > 33.3).length,
            rowAdds: frames.rowAdds,
            scrollDistance: frames.distance,
            longTaskMs: frames.longTaskMs,
            ...metricDelta(before, after),
          };
        }

        const idle = await sample("idle");
        const scroll = await sample("scroll");
        const result = { cycle: cycle + 1, mode: mode.label, idle, scroll };
        results.push(result);
        console.log("SCROLL_BENCH_SAMPLE " + JSON.stringify(result));
        await session.detach();
      } finally {
        await page.close();
      }
    }
  }

  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/scroll-benchmark.json",
    JSON.stringify({ modes, results }, null, 2), "utf8");

  for (const mode of modes) {
    const samples = results.filter((result) => result.mode === mode.label) as {
      scroll: { p95FrameMs: number; framesOver25Ms: number; TaskDurationMs?: number;
        ScriptDurationMs?: number; LayoutDurationMs?: number; rowAdds: number };
    }[];
    const median = (select: (sample: typeof samples[number]) => number) =>
      percentile(samples.map(select), 0.5);
    console.log("SCROLL_BENCH_MEDIAN " + JSON.stringify({
      mode: mode.label,
      p95FrameMs: median((s) => s.scroll.p95FrameMs),
      framesOver25Ms: median((s) => s.scroll.framesOver25Ms),
      taskMs: median((s) => s.scroll.TaskDurationMs ?? 0),
      scriptMs: median((s) => s.scroll.ScriptDurationMs ?? 0),
      layoutMs: median((s) => s.scroll.LayoutDurationMs ?? 0),
      mountedRows: median((s) => s.scroll.rowAdds),
    }));
  }
});
