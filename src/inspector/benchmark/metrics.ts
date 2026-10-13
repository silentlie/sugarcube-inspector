/** Instrumentation is inert unless a local benchmark is recording. */
export const BENCHMARK_BUILD =
  import.meta.env.DEV || import.meta.env.VITE_SC_INSPECTOR_BENCHMARK === "1";

export type BenchVariant =
  "normal" | "noTree" | "noAnt" | "plainRows" | "noRootWatch" | "noRowWatch";

export type Stat = { calls: number; totalMs: number; maxMs: number };
export type Stats = Record<string, Stat>;
export type ReactCommit = {
  id: string; phase: string; startMs: number; commitMs: number; durationMs: number;
};
export type Capture = { stats: Stats; commits: ReactCommit[] };
let current: Capture | undefined;
let variant: BenchVariant = "normal";

export function benchmarkVariant(): BenchVariant {
  return BENCHMARK_BUILD ? variant : "normal";
}
export function setBenchmarkVariant(next: BenchVariant): void {
  if (BENCHMARK_BUILD) variant = next;
}
export function startCapture(): Capture {
  const capture: Capture = { stats: {}, commits: [] };
  current = capture;
  return capture;
}
export function stopCapture(): void { current = undefined; }

export function count(name: string): void {
  if (!current) return;
  const stat = current.stats[name] ??= { calls: 0, totalMs: 0, maxMs: 0 };
  stat.calls++;
}
export function timed<T>(name: string, work: () => T): T {
  const capture = current;
  if (!capture) return work();
  const start = performance.now();
  try { return work(); }
  finally {
    const ms = performance.now() - start;
    const stat = capture.stats[name] ??= { calls: 0, totalMs: 0, maxMs: 0 };
    stat.calls++;
    stat.totalMs += ms;
    stat.maxMs = Math.max(stat.maxMs, ms);
  }
}
export function reactCommit(
  id: string, phase: string, durationMs: number,
  startMs: number, commitMs: number,
): void {
  if (!current) return;
  current.commits.push({ id, phase, startMs, commitMs, durationMs });
  const stat = current.stats["react." + id] ??=
    { calls: 0, totalMs: 0, maxMs: 0 };
  stat.calls++;
  stat.totalMs += durationMs;
  stat.maxMs = Math.max(stat.maxMs, durationMs);
}
