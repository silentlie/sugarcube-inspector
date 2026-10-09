import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("returns the original value and clears the timer when the operation succeeds", async () => {
    const operation = Promise.withResolvers<object>();
    const value = { score: 7 };
    const result = withTimeout(operation.promise);

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_999);
    operation.resolve(value);

    await expect(result).resolves.toBe(value);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new Error("Bridge unavailable"), "Bridge unavailable"])(
    "preserves the original rejection (%s) and clears the timer",
    async (cause) => {
      const operation = Promise.withResolvers<never>();
      const result = withTimeout(operation.promise);
      const rejection = expect(result).rejects.toBe(cause);

      operation.reject(cause);

      await rejection;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { name: "default", timeoutMs: undefined, deadline: 3_000 },
    { name: "custom", timeoutMs: 75, deadline: 75 },
  ])(
    "rejects at the $name deadline, never before it",
    async ({ timeoutMs, deadline }) => {
      const operation = Promise.withResolvers<never>();
      const result = withTimeout(operation.promise, timeoutMs);
      const settled = vi.fn();
      void result.then(settled, settled);
      const rejection = expect(result).rejects.toThrow(
        `Operation timed out after ${deadline}ms`,
      );

      await vi.advanceTimersByTimeAsync(deadline - 1);

      expect(settled).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(1);

      await rejection;
      expect(settled).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("honors a zero timeout instead of using the default deadline", async () => {
    const result = withTimeout(new Promise<never>(() => {}), 0);
    const rejection = expect(result).rejects.toThrow(
      "Operation timed out after 0ms",
    );

    await vi.advanceTimersByTimeAsync(0);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"] as const)(
    "stays rejected when the original operation later %ss",
    async (outcome) => {
      const operation = Promise.withResolvers<string>();
      const result = withTimeout(operation.promise, 10);
      const caught = result.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(10);
      const timeoutError = await caught;
      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError).toHaveProperty(
        "message",
        "Operation timed out after 10ms",
      );

      if (outcome === "resolve") {
        operation.resolve("late result");
      } else {
        operation.reject(new Error("late failure"));
      }
      await vi.advanceTimersByTimeAsync(0);

      await expect(result).rejects.toBe(timeoutError);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps concurrent operations' deadlines independent", async () => {
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<never>();
    const firstResult = withTimeout(first.promise, 50);
    const secondResult = withTimeout(second.promise, 100);
    const rejection = expect(secondResult).rejects.toThrow(
      "Operation timed out after 100ms",
    );

    expect(vi.getTimerCount()).toBe(2);
    first.resolve("first result");

    await expect(firstResult).resolves.toBe("first result");
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
