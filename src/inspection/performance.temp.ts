/** Temporary benchmark instrumentation; removed after measurements. */
export type BenchSession = {
  totals: Record<string, number>;
  counts: Record<string, number>;
  stamps: Record<string, number>;
  skipRefresh: boolean;
  plainSyntax: boolean;
};
export function currentBench(): BenchSession | undefined {
  return (globalThis as typeof globalThis & { __scBench?: BenchSession }).__scBench;
}
export function profiled<T>(label: string, read: () => T): T {
  const bench = currentBench();
  if (!bench) return read();
  const start = performance.now();
  try { return read(); } finally {
    bench.totals[label] = (bench.totals[label] ?? 0) + performance.now() - start;
    bench.counts[label] = (bench.counts[label] ?? 0) + 1;
  }
}
export function hit(label: string): void {
  const bench = currentBench();
  if (bench) bench.counts[label] = (bench.counts[label] ?? 0) + 1;
}
export function stamp(label: string): void {
  const bench = currentBench();
  if (bench) bench.stamps[label] = performance.now();
}
