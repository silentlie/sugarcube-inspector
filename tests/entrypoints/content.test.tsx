// @vitest-environment happy-dom

import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ShadowRootContentScriptUiOptions } from "wxt/utils/content-script-ui/shadow-root";
import contentScript from "../../entrypoints/content";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn<(type: string, data: unknown) => Promise<unknown>>(),
  createShadowRootUi: vi.fn(),
  mount: vi.fn(),
  createRoot: vi.fn(),
  root: { render: vi.fn(), unmount: vi.fn() },
}));

vi.mock("../../src/sugarcube/rpc", () => ({
  sugarcubeRPC: { sendMessage: mocks.sendMessage },
}));
vi.mock("wxt/utils/content-script-ui/shadow-root", () => ({
  createShadowRootUi: mocks.createShadowRootUi,
}));
vi.mock("react-dom/client", () => ({
  default: { createRoot: mocks.createRoot },
}));

describe("inspector startup", () => {
  let context: ContentScriptContext;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.sendMessage.mockReset();
    mocks.createShadowRootUi.mockReset();
    mocks.createShadowRootUi.mockResolvedValue({ mount: mocks.mount });
    mocks.createRoot.mockReturnValue(mocks.root);
    document.body.innerHTML = '<tw-storydata format="SugarCube"></tw-storydata>';
    context = new ContentScriptContext("inspector-startup-test");
  });

  afterEach(() => {
    context.notifyInvalidated();
    document.body.innerHTML = "";
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    { name: "an ordinary page", html: "<main>No story</main>" },
    { name: "another story format", html: '<tw-storydata format="Harlowe"></tw-storydata>' },
  ])("skips $name without requesting readiness or creating UI", async ({ html }) => {
    document.body.innerHTML = html;

    await contentScript.main(context);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
    expect(mocks.mount).not.toHaveBeenCalled();
  });

  it("waits for a true readiness response before creating and mounting UI", async () => {
    const readiness = Promise.withResolvers<unknown>();
    mocks.sendMessage.mockReturnValueOnce(readiness.promise);
    const startup = contentScript.main(context);

    expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith("bridgeReady", undefined);
    expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
    expect(mocks.mount).not.toHaveBeenCalled();

    readiness.resolve(true);
    await startup;

    expect(mocks.createShadowRootUi).toHaveBeenCalledExactlyOnceWith(
      context,
      expect.objectContaining({ name: "sugarcube-inspector" }),
    );
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, undefined, null, "true", 1, { ready: true }])(
    "rejects invalid readiness %s without mounting UI",
    async (response) => {
      mocks.sendMessage.mockResolvedValueOnce(response);

      await expect(contentScript.main(context)).rejects.toThrow(
        "Invalid SugarCube RPC readiness response.",
      );

      expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
      expect(mocks.mount).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("propagates a readiness failure without mounting UI", async () => {
    const cause = new Error("Bridge initialization failed");
    mocks.sendMessage.mockRejectedValueOnce(cause);

    await expect(contentScript.main(context)).rejects.toBe(cause);

    expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
    expect(mocks.mount).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out readiness at three seconds and never mounts after a late response", async () => {
    const readiness = Promise.withResolvers<unknown>();
    mocks.sendMessage.mockReturnValueOnce(readiness.promise);
    const startup = contentScript.main(context);
    const rejection = expect(startup).rejects.toThrow("Operation timed out after 3000ms");

    await vi.advanceTimersByTimeAsync(2_999);
    expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    readiness.resolve(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.createShadowRootUi).not.toHaveBeenCalled();
    expect(mocks.mount).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("creates the React root on mount and unmounts it when UI is removed", async () => {
    mocks.sendMessage.mockResolvedValueOnce(true);
    await contentScript.main(context);
    const options = mocks.createShadowRootUi.mock.calls[0]![1] as ShadowRootContentScriptUiOptions<Root>;
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");

    const root = options.onMount(container, shadow, host);

    expect(mocks.createRoot).toHaveBeenCalledExactlyOnceWith(container);
    expect(mocks.root.render).toHaveBeenCalledTimes(1);

    options.onRemove?.(root);
    expect(mocks.root.unmount).toHaveBeenCalledTimes(1);
    expect(() => options.onRemove?.(undefined)).not.toThrow();
  });
});
