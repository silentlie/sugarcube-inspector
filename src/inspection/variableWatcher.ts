import { count, timed } from "../inspector/benchmark/metrics";

export interface VariableSubscription<T> {
  getSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
}

type ActiveWatch = { check: () => void };

/** Shared scheduler: one interval for all mounted variable and structure subscriptions. */
export class VariableWatcher {
  private readonly active = new Set<ActiveWatch>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly intervalMs = 250) {}

  watch<T>(read: () => T, equal: (a: T, b: T) => boolean): VariableSubscription<T> {
    count("watch.create");
    let current = timed("watch.read", read);
    const listeners = new Set<() => void>();
    const observer: ActiveWatch = {
      check: () => {
        count("watch.check");
        const next = timed("watch.read", read);
        if (equal(current, next)) return;
        count("watch.changed");
        current = next;
        for (const listener of [...listeners]) listener();
      },
    };

    return {
      getSnapshot: () => current,
      subscribe: (callback) => {
        count("watch.subscribe");
        listeners.add(callback);
        if (listeners.size === 1) this.start(observer);
        observer.check(); // Catch mutations between React render and subscription.
        return () => {
          count("watch.unsubscribe");
          listeners.delete(callback);
          if (listeners.size === 0) this.stop(observer);
        };
      },
    };
  }

  refresh(): void {
    timed("watch.refreshAll", () => {
      for (const watcher of [...this.active]) watcher.check();
    });
  }

  private start(observer: ActiveWatch): void {
    this.active.add(observer);
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.refresh(), this.intervalMs);
    }
  }

  private stop(observer: ActiveWatch): void {
    this.active.delete(observer);
    if (this.active.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export const variableWatcher = new VariableWatcher();
