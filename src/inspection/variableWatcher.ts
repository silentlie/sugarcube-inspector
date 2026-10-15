export interface VariableSubscription<T> {
  getSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
}

type ActiveWatch = () => void;
type WatchScope = { active: boolean; subscribed: Set<ActiveWatch> };

/** Shared scheduler: one interval for all mounted variable and structure subscriptions. */
export class VariableWatcher {
  private readonly active = new Set<ActiveWatch>();
  private readonly scopes = new Map<string, WatchScope>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly intervalMs = 250) {}

  /** Activation is owned by the selected tree scope, not by individual rows. */
  setScopeActive(scope: string, active: boolean): void {
    const state = this.getScope(scope);
    if (state.active === active) return;
    state.active = active;
    for (const observer of state.subscribed) {
      if (active) {
        this.start(observer);
        observer(); // Catch changes made while the tab was hidden.
      } else {
        this.stop(observer);
      }
    }
  }

  private getScope(scope: string): WatchScope {
    let state = this.scopes.get(scope);
    if (!state) {
      state = { active: false, subscribed: new Set() };
      this.scopes.set(scope, state);
    }
    return state;
  }

  watch<T>(read: () => T, equal: (a: T, b: T) => boolean, scope: string): VariableSubscription<T> {
    let current = read();
    const listeners = new Set<() => void>();
    const observer: ActiveWatch = () => {
      const next = read();
      if (equal(current, next)) return;
      current = next;
      for (const listener of [...listeners]) listener();
    };

    return {
      getSnapshot: () => current,
      subscribe: (callback) => {
        listeners.add(callback);
        if (listeners.size === 1) {
          const state = this.getScope(scope);
          state.subscribed.add(observer);
          if (state.active) this.start(observer);
        }
        if (this.getScope(scope).active) {
          observer(); // Catch mutations between render and subscription.
        }
        return () => {
          listeners.delete(callback);
          if (listeners.size !== 0) return;
          this.getScope(scope).subscribed.delete(observer);
          this.stop(observer);
        };
      },
    };
  }

  refresh(): void {
    // Temporary A/B benchmark switch. Not intended for production.
    if ((globalThis as typeof globalThis & { __SCROLL_BENCH_PAUSE_WATCH__?: boolean }).__SCROLL_BENCH_PAUSE_WATCH__) return;
    for (const watcher of [...this.active]) watcher();
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
