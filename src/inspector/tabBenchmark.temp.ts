/** Temporary browser benchmarking instrumentation. Remove after measurements. */
export type Mode = "normal" | "destroy" | "noTree" | "noAnt" | "plain" | "capped";
export type Measurement = { name: string; at: number; ms: number; count?: number };
export type TabBenchmark = { mode: Mode; measures: Measurement[] };
declare global { interface Window { __scTabBenchmark?: TabBenchmark } }
export const getBench = (): TabBenchmark | undefined => window.__scTabBenchmark;
export const benchMode = (): Mode => getBench()?.mode ?? "normal";
export function timed<T>(name: string, fn: () => T): T {
  const state = getBench();
  if (!state) return fn();
  const start = performance.now();
  try { return fn(); }
  finally { state.measures.push({ name, at: start, ms: performance.now() - start }); }
}
