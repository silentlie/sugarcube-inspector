export interface VariableSubscription<T> {
  getSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
}

type ActiveWatch = () => void;
type WatchScope = { active: boolean; subscribed: Set<ActiveWatch> };

/** Shared scheduler: one interval for all mounted variable and structure subscriptions. */
export class VariableWatcher {
  private readonly active = new Set<ActiveWatch>();
  private readonly before = new Set<ActiveWatch>();
  private readonly scopes = new Map<string, WatchScope>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private sampleBatch: object | undefined;

  constructor(private readonly intervalMs = 250) {}

  /** Activation is owned by the selected tree scope, not by individual rows. */
  setScopeActive(scope: string, active: boolean): void {
    const state = this.getScope(scope);
    if (state.active === active) return;
    state.active = active;
    for (const observer of state.subscribed) {
      if (active) {
        this.start(observer);
      } else {
        this.stop(observer);
      }
    }
    // Catch up alongside active favorites so overlapping samples share a batch.
    if (active) this.refresh();
  }

  private getScope(scope: string): WatchScope {
    let state = this.scopes.get(scope);
    if (!state) {
      state = { active: false, subscribed: new Set() };
      this.scopes.set(scope, state);
    }
    return state;
  }

  watch<T>(read: () => T, equal: (a: T, b: T) => boolean, scope: string, initial = read(), onSample?: (snapshot: T, batch: object) => void): VariableSubscription<T> {
    let current = initial;
    const listeners = new Set<() => void>();
    const observer: ActiveWatch = () => {
      let next: T;
      try {
        next = read();
      } catch {
        // Keep the last readable snapshot and retry without interrupting other watches.
        return;
      }
      try { onSample?.(next, this.sampleBatch ?? {}); } catch { /* A sample observer must not interrupt other watches. */ }
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
    this.sampleBatch = {};
    try {
      for (const action of [...this.before]) action();
      for (const watcher of [...this.active]) watcher();
    } finally { this.sampleBatch = undefined; }
  }

  beforeRefresh(action: ActiveWatch): () => void {
    this.before.add(action);
    this.startTimer();
    return () => {
      this.before.delete(action);
      this.stopTimerIfIdle();
    };
  }

  private start(observer: ActiveWatch): void {
    this.active.add(observer);
    this.startTimer();
  }

  private startTimer(): void {
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.refresh(), this.intervalMs);
    }
  }

  private stop(observer: ActiveWatch): void {
    this.active.delete(observer);
    this.stopTimerIfIdle();
  }

  private stopTimerIfIdle(): void {
    if (this.active.size === 0 && this.before.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export const variableWatcher = new VariableWatcher();
