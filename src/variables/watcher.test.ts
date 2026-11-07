import { afterEach, expect, it, vi } from "vitest";
import { VariableWatcher } from "./watcher";

afterEach(() => vi.useRealTimers());

it("shares a sample batch within one refresh and changes it for the next", () => {
  vi.useFakeTimers();
  const watcher = new VariableWatcher();
  const batches: object[] = [];
  const stops = [1, 2].map((value) => watcher.watch(() => value, Object.is, "test", value,
    (_, batch) => batches.push(batch)).subscribe(() => {}));
  watcher.setScopeActive("test", true);
  batches.length = 0;
  watcher.refresh();
  expect(batches[0]).toBe(batches[1]);
  watcher.refresh();
  expect(batches[2]).toBe(batches[3]);
  expect(batches[0]).not.toBe(batches[2]);
  for (const stop of stops) stop();
});

it("observes unchanged samples and isolates observer failures from normal watches", () => {
  vi.useFakeTimers();
  const watcher = new VariableWatcher(20);
  let value = 1;
  const samples = vi.fn(() => { throw new Error("Sample failure"); });
  const watched = watcher.watch(() => value, Object.is, "test", value, samples);
  const other = watcher.watch(() => value * 2, Object.is, "test");
  const changed = vi.fn();
  const stop = watched.subscribe(changed);
  const stopOther = other.subscribe(() => {});
  watcher.setScopeActive("test", true);
  watcher.refresh();
  expect(samples).toHaveBeenCalledTimes(2);
  expect(changed).not.toHaveBeenCalled();
  value = 3;
  watcher.refresh();
  expect(watched.getSnapshot()).toBe(3);
  expect(other.getSnapshot()).toBe(6);
  expect(changed).toHaveBeenCalledTimes(1);
  stop();
  stopOther();
});
