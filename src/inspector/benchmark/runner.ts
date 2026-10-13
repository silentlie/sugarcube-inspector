import {
  BENCHMARK_BUILD, benchmarkVariant, setBenchmarkVariant,
  startCapture, stopCapture, type BenchVariant, type Capture, type Stats,
  type ReactCommit,
} from "./metrics";

export type BenchmarkResult = {
  mode: "auto" | "manual";
  variant: BenchVariant;
  frameBudgetMs: number;
  periods: Period[];
  /** Manual recording: all watcher and tree metrics during the capture window. */
  aggregateStats?: Stats;
  hints: string[];
};

export type Period = {
  click: string;
  cold: boolean;
  maxFrameGapMs: number;
  p95FrameGapMs: number;
  minInstantFps: number;
  estimatedMissedFrames: number;
  framesOver2Budgets: number;
  longTaskCount: number;
  longestTaskMs: number;
  treeRows: number;
  stats: Stats;
  commits: ReactCommit[];
};
type Options = {
  cycles?: number;
  from?: "Overview" | "Scripts";
  variant?: BenchVariant;
  sampleMs?: number;
  settleMs?: number;
};
type ManualOptions = { seconds?: number };
export type BenchmarkAPI = {
  run(options?: Options): Promise<BenchmarkResult>;
  record(options?: ManualOptions): Promise<BenchmarkResult>;
  export(): string;
  last: BenchmarkResult | null;
};
const variants: BenchVariant[] = [
  "normal", "destroyOnHidden", "noTree", "noAnt", "plainRows", "noRootWatch", "noRowWatch",
];
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};
const percentile = (numbers: number[], p: number) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)]! : 0;
};
const numberOption = (value: number | undefined, fallback: number, min: number, max: number) => {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new Error(`Expected a value between ${min} and ${max}`);
  }
  return result;
};
function shadowRoot(): ShadowRoot {
  const root = document.querySelector("sugarcube-inspector")?.shadowRoot;
  if (!root) throw new Error("Open a SugarCube game with the inspector loaded first.");
  return root;
}
function topTabs(shadow: ShadowRoot): HTMLElement {
  const tabs = shadow.querySelector<HTMLElement>(".inspector-tabs");
  if (!tabs) throw new Error("Inspector tabs are not initialized yet.");
  return tabs;
}
function tab(shadow: ShadowRoot, label: string): HTMLElement {
  const tabs = topTabs(shadow);
  const nav = tabs.querySelector(".ant-tabs-nav");
  const item = Array.from(nav?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    .find((element) => element.textContent?.trim() === label);
  if (!item) throw new Error("Tab not found: " + label);
  return item;
}
function activeTab(shadow: ShadowRoot): string {
  const nav = topTabs(shadow).querySelector(".ant-tabs-nav");
  return nav?.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? "";
}
async function clickTab(shadow: ShadowRoot, label: string): Promise<void> {
  if (activeTab(shadow) === label) return;
  tab(shadow, label).click();
  const deadline = performance.now() + 3000;
  while (activeTab(shadow) !== label) {
    if (performance.now() > deadline) throw new Error("Tab didn't activate: " + label);
    await delay(16);
  }
}
function rafFrames(): { times: number[]; stop: () => void } {
  const times: number[] = [];
  let running = true;
  function frame(time: number) {
    times.push(time);
    if (running) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { times, stop: () => { running = false; } };
}
async function frameBudget(): Promise<number> {
  const frames: number[] = [];
  await new Promise<void>((resolve) => {
    function tick(time: number) {
      frames.push(time);
      if (frames.length < 18) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  const intervals = frames.slice(1).map((value, i) => value - frames[i]!);
  return median(intervals) || 16.667;
}
function longTasks() {
  const entries: { start: number; ms: number }[] = [];
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({ start: entry.startTime, ms: entry.duration });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  }
  return {
    entries,
    stop: () => {
      for (const entry of observer?.takeRecords() ?? []) {
        entries.push({ start: entry.startTime, ms: entry.duration });
      }
      observer?.disconnect();
    },
  };
}
function summarisePeriod(
  label: string, cold: boolean, budget: number,
  frames: number[], tasks: { start: number; ms: number }[],
  begin: number, end: number, capture: Capture, shadow: ShadowRoot,
): Period {
  // Include the frame crossing the click boundary, which contains blocking work.
  const firstIndex = frames.findIndex((t) => t >= begin);
  const from = Math.max(1, firstIndex === -1 ? frames.length - 1 : firstIndex);
  const gaps: number[] = [];
  for (let i = from; i < frames.length; i++) {
    if (frames[i - 1]! > end) break;
    gaps.push(frames[i]! - frames[i - 1]!);
  }
  const max = Math.max(0, ...gaps);
  const observed = tasks.filter((entry) => entry.start >= begin && entry.start <= end);
  return {
    click: label, cold,
    maxFrameGapMs: max,
    p95FrameGapMs: percentile(gaps, 0.95),
    minInstantFps: max ? 1000 / max : 0,
    estimatedMissedFrames: gaps.reduce(
      (n, gap) => n + Math.max(0, Math.round(gap / budget) - 1), 0),
    framesOver2Budgets: gaps.filter((gap) => gap > 2 * budget).length,
    longTaskCount: observed.length,
    longestTaskMs: Math.max(0, ...observed.map((entry) => entry.ms)),
    treeRows: shadow.querySelectorAll('[role="treeitem"]').length,
    stats: capture.stats,
    commits: capture.commits,
  };
}
const format = (value: number) => Math.round(value * 10) / 10;
function display(result: BenchmarkResult) {
  console.table(result.periods.map((period, i) => ({
    "#": i + 1,
    click: period.click,
    first: period.cold,
    worstFrameMs: format(period.maxFrameGapMs),
    p95FrameMs: format(period.p95FrameGapMs),
    minFPS: format(period.minInstantFps),
    missedFrames: period.estimatedMissedFrames,
    longTasks: period.longTaskCount,
    longestTaskMs: format(period.longestTaskMs),
    treeRows: period.treeRows,
  })));
  console.table(result.periods.map((period, i) => {
    const stats = period.stats;
    return {
      "#": i + 1,
      treeModelMs: format((stats["tree.initial"]?.totalMs ?? 0) +
        (stats["tree.rootReconcile"]?.totalMs ?? 0)),
      antReactMs: format(stats["react.antTree"]?.totalMs ?? 0),
      rowRenders: stats["row.render"]?.calls ?? 0,
      rootReconciles: stats["tree.rootReconcile"]?.calls ?? 0,
      watchesCreated: stats["watch.create"]?.calls ?? 0,
      subscribes: stats["watch.subscribe"]?.calls ?? 0,
      unsubscribes: stats["watch.unsubscribe"]?.calls ?? 0,
      watchReadMs: format(stats["watch.read"]?.totalMs ?? 0),
      watchChecks: stats["watch.check"]?.calls ?? 0,
    };
  }));
  console.info("Refresh interval baseline:", format(result.frameBudgetMs),
    "ms. React Profiler times are render estimates, not separate wall-clock segments.");
  console.info("Full numeric report: scInspectorBench.last | JSON: scInspectorBench.export()");
}

export function installBenchmark(): BenchmarkAPI {
  if (!BENCHMARK_BUILD) throw new Error("Use a development or benchmark build.");
  let busy = false;
  const api: BenchmarkAPI = {
    last: null,
    export: () => JSON.stringify(api.last, null, 2),
    async run(options = {}) {
      if (busy) throw new Error("A benchmark is already running.");
      busy = true;
      const shadow = shadowRoot();
      const variant = options.variant ?? "normal";
      if (!variants.includes(variant)) throw new Error("Unsupported benchmark variant: " + variant);
      const cycles = numberOption(options.cycles, 5, 1, 30);
      const sampleMs = numberOption(options.sampleMs, 450, 150, 3000);
      const settleMs = numberOption(options.settleMs, 240, 60, 2000);
      const from = options.from ?? "Overview";
      const original = activeTab(shadow);
      const wasMounted = !!shadow.querySelector('[aria-label="Story variables tree"]');
      const previous = benchmarkVariant();
      const periods: Period[] = [];
      try {
        setBenchmarkVariant(variant);
        await clickTab(shadow, from);
        await delay(settleMs);
        const budget = await frameBudget();
        for (let i = 0; i < cycles; i++) {
          await delay(settleMs);
          // Detect each remount separately, including destroyOnHidden revisits.
          const treeWasMounted = !!shadow.querySelector('[aria-label="Story variables tree"]');
          const cold = variant !== "noTree" && variant !== "noAnt" && !treeWasMounted;
          const frame = rafFrames();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const tasks = longTasks();
          const capture = startCapture();
          const begin = performance.now();
          tab(shadow, "Variables").click();
          await delay(sampleMs);
          const end = performance.now();
          stopCapture();
          frame.stop();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          tasks.stop();
          periods.push(summarisePeriod(
            "Variables", cold,
            budget, frame.times, tasks.entries, begin, end, capture, shadow,
          ));
          await clickTab(shadow, from);
        }
        const result: BenchmarkResult = {
          mode: "auto", variant, frameBudgetMs: budget, periods,
          hints: [
            variant === "destroyOnHidden"
              ? "Outer Tabs destroyOnHidden=true: each Variables visit should remount the tree."
              : wasMounted ? "Tree was already mounted before the run; no initial cold mount." :
                "Normal Tabs retain their tree after the first mount; cold flags reflect DOM absence before each click.",
            "noTree/noAnt variants do not render Ant Tree, so cold is reported as false.",
            "For comparable ablations, reload the game before each variant.",
            "No game values or variable names are included in the exported report.",
          ],
        };
        api.last = result;
        display(result);
        return result;
      } finally {
        stopCapture();
        setBenchmarkVariant(previous);
        try { await clickTab(shadow, original); } catch { /* Page may be closing. */ }
        busy = false;
      }
    },
    async record(options = {}) {
      if (busy) throw new Error("A benchmark is already running.");
      busy = true;
      const seconds = numberOption(options.seconds, 12, 2, 60);
      const shadow = shadowRoot();
      const clicks: { label: string; start: number; capture: Capture }[] = [];
      const budget = await frameBudget();
      const frames = rafFrames();
      const tasks = longTasks();
      // A capture spans the full manual session. Statistics are totals for the
      // session, not attributable to individual tab clicks.
      const capture = startCapture();
      const onClick = (event: Event) => {
        const path = event.composedPath();
        const element = path.find((node) => node instanceof HTMLElement &&
          node.getAttribute("role") === "tab") as HTMLElement | undefined;
        if (!element || !topTabs(shadow).contains(element)) return;
        const label = element.textContent?.trim();
        if (label === "Variables" || label === "Overview" || label === "Scripts") {
          clicks.push({ label, start: performance.now(), capture });
        }
      };
      shadow.addEventListener("click", onClick, true);
      console.info(`Recording for ${seconds}s. Switch Overview / Scripts / Variables normally.`);
      try {
        await delay(seconds * 1000);
        stopCapture();
        frames.stop();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        tasks.stop();
        const periods = clicks.map((click) => summarisePeriod(
          click.label, false, budget, frames.times, tasks.entries,
          click.start, Math.min(click.start + 500, performance.now()),
          { stats: {}, commits: [] }, shadow,
        ));
        const result: BenchmarkResult = {
          mode: "manual", variant: benchmarkVariant(),
          frameBudgetMs: budget, periods, aggregateStats: capture.stats,
          hints: ["Manual capture stats below are aggregated across the entire recording.",
            "Manual mode includes game work and DevTools overhead."],
        };
        api.last = result;
        display(result);
        console.info("Aggregate activity during recording:", capture.stats);
        return result;
      } finally {
        shadow.removeEventListener("click", onClick, true);
        stopCapture();
        frames.stop();
        tasks.stop();
        busy = false;
      }
    },
  };
  Object.defineProperty(window, "scInspectorBench", {
    value: api, configurable: true, writable: false,
  });
  console.info("SugarCube Inspector benchmark ready: await scInspectorBench.run() " +
    "or await scInspectorBench.record({ seconds: 12 })");
  return api;
}
