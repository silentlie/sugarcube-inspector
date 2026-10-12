/** Temporary rendering benchmark controls. */
export type RowVariant = "baseline" | "plainSyntax" | "noObserver" | "minimalRow" | "capped25";
type RowBench = {
  variant: RowVariant;
  counts: Record<string, number>;
  commits: { at: number; duration: number; phase: string }[];
};
export function bench(): RowBench | undefined {
  return (globalThis as typeof globalThis & { __scRowBench?: RowBench }).__scRowBench;
}
export function benchHit(label: string): void {
  const state = bench();
  if (state) state.counts[label] = (state.counts[label] ?? 0) + 1;
}
