import { equalWatchedValues, equalWatchedValuesArrayFirst, equalWatchedValuesArrayFirstMapRefs, equalWatchedValuesMapRefs, equalWatchedValuesLazyRefs, equalWatchedValuesArrayFirstLazyRefs } from "./watchEqual";

export type EqualityVariant = "keys-weak" | "arrays-weak" | "keys-map" | "arrays-map" | "keys-lazy" | "arrays-lazy";
export type PollingVariant = "compare-first" | "clone-first" | "always-clone";

export interface WatchPollMeasurement {
  changed: boolean;
  value?: unknown;
  compareMs: number;
  cloneMs: number;
  mainMs: number;
}

const comparators = {
  "keys-weak": equalWatchedValues,
  "arrays-weak": equalWatchedValuesArrayFirst,
  "keys-map": equalWatchedValuesMapRefs,
  "arrays-map": equalWatchedValuesArrayFirstMapRefs,
  "keys-lazy": equalWatchedValuesLazyRefs,
  "arrays-lazy": equalWatchedValuesArrayFirstLazyRefs,
} satisfies Record<EqualityVariant, (left: unknown, right: unknown) => boolean>;

/** Experimental only: no production RPC changes or watch-manager state changes. */
export class ExperimentalWatchPoller {
  private initialized = false;
  private baseline: unknown;
  private readonly equals: (left: unknown, right: unknown) => boolean;

  constructor(
    private readonly strategy: PollingVariant,
    equality: EqualityVariant = "keys-weak",
  ) {
    this.equals = comparators[equality];
  }

  poll(current: unknown): WatchPollMeasurement {
    const started = performance.now();
    let compareMs = 0;
    let cloneMs = 0;

    if (this.initialized && this.strategy !== "always-clone") {
      let candidate = current;
      if (this.strategy === "clone-first") {
        const cloneStarted = performance.now();
        candidate = structuredClone(current);
        cloneMs = performance.now() - cloneStarted;
      }

      const compareStarted = performance.now();
      const unchanged = this.equals(this.baseline, candidate);
      compareMs = performance.now() - compareStarted;
      if (unchanged) {
        return { changed: false, compareMs, cloneMs, mainMs: performance.now() - started };
      }

      if (this.strategy === "clone-first") {
        this.baseline = candidate;
        return { changed: true, value: candidate, compareMs, cloneMs, mainMs: performance.now() - started };
      }
    }

    const cloneStarted = performance.now();
    const next = structuredClone(current);
    cloneMs += performance.now() - cloneStarted;
    if (this.strategy !== "always-clone") {
      this.baseline = next;
      this.initialized = true;
    }

    return { changed: true, value: next, compareMs, cloneMs, mainMs: performance.now() - started };
  }
}
