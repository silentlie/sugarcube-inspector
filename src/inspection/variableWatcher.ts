export interface VariableSubscription<T> {
  getSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
}

type ActiveWatch = { check: () => void };
type WatchScope = { visible: boolean; subscribed: Set<ActiveWatch> };

/** Shared scheduler: one interval for all mounted variable and structure subscriptions. */
export class VariableWatcher {
  private readonly active = new Set<ActiveWatch>();
  private readonly scopes = new Map<string, WatchScope>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly intervalMs = 250) {}

  /** Visibility is owned by the tree scope, not by individual rows. */
  setScopeVisible(scope: string, visible: boolean): void {
    const state = this.getScope(scope);
    if (state.visible === visible) return;
    state.visible = visible;
    for (const observer of state.subscribed) {
      if (visible) {
        this.start(observer);
        observer.check(); // Catch changes made while the tab was hidden.
      } else {
        this.stop(observer);
      }
    }
  }

  private getScope(scope: string): WatchScope {
    let state = this.scopes.get(scope);
    if (!state) {
      state = { visible: false, subscribed: new Set() };
      this.scopes.set(scope, state);
    }
    return state;
  }

  watch<T>(read: () => T, equal: (a: T, b: T) => boolean, scope?: string): VariableSubscription<T> {
    let current = read();
    const listeners = new Set<() => void>();
    const observer: ActiveWatch = {
      check: () => {
        const next = read();
        if (equal(current, next)) return;
        current = next;
        for (const listener of [...listeners]) listener();
      },
    };

    return {
      getSnapshot: () => current,
      subscribe: (callback) => {
        listeners.add(callback);
        if (listeners.size === 1) {
          if (scope === undefined) {
            this.start(observer);
          } else {
            const state = this.getScope(scope);
            state.subscribed.add(observer);
            if (state.visible) this.start(observer);
          }
        }
        if (scope === undefined || this.getScope(scope).visible) {
          observer.check(); // Catch mutations between render and subscription.
        }
        return () => {
          listeners.delete(callback);
          if (listeners.size !== 0) return;
          if (scope !== undefined) this.getScope(scope).subscribed.delete(observer);
          this.stop(observer);
        };
      },
    };
  }

  refresh(): void {
    for (const watcher of [...this.active]) watcher.check();
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
