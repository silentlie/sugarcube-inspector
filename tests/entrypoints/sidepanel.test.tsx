// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import App from "../../entrypoints/sidepanel/App";

const localTab = {
  id: 42,
  index: 0,
  windowId: 1,
  active: true,
  highlighted: true,
  pinned: false,
  incognito: false,
  url: "file:///story.html",
};

const scriptResult = {
  frameId: 0,
  result: {
    detected: true,
    storyName: "Test Story",
    ifid: "TEST-IFID",
    passage: "Start",
  },
};

describe("side panel detection", () => {
  beforeEach(() => {
    vi.spyOn(browser.tabs, "query").mockImplementation(async () => [localTab]);
    vi.spyOn(browser.scripting, "executeScript").mockImplementation(
      async () => [scriptResult],
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("starts in checking, displays story metadata, and checks again on Refresh", async () => {
    const initial = Promise.withResolvers<(typeof localTab)[]>();
    const refresh = Promise.withResolvers<(typeof localTab)[]>();
    vi.mocked(browser.tabs.query)
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => refresh.promise);
    render(<App />);

    expect(screen.getByText("Checking current page...")).toBeDefined();
    expect(browser.tabs.query).toHaveBeenCalledExactlyOnceWith({
      active: true,
      currentWindow: true,
    });
    expect(browser.scripting.executeScript).not.toHaveBeenCalled();

    await act(async () => {
      initial.resolve([localTab]);
    });
    expect(screen.getByText("✅ SugarCube detected")).toBeDefined();
    expect(screen.getByText("Test Story")).toBeDefined();
    expect(screen.getByText("Start")).toBeDefined();
    expect(screen.getByText("TEST-IFID")).toBeDefined();
    expect(browser.scripting.executeScript).toHaveBeenCalledExactlyOnceWith({
      target: { tabId: 42 },
      world: "MAIN",
      func: expect.any(Function),
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Checking current page...")).toBeDefined();
    expect(screen.queryByText("Test Story")).toBeNull();
    expect(browser.tabs.query).toHaveBeenCalledTimes(2);

    await act(async () => {
      refresh.resolve([{ ...localTab, url: "https://example.com/story.html" }]);
    });
    expect(
      screen.getByText("Open a local HTML file to use the inspector."),
    ).toBeDefined();
    expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error("Tab query threw synchronously"),
    "Tab query threw synchronously",
  ])(
    "handles a synchronous browser API throw (%s) after initialization and recovers on Refresh",
    async (cause) => {
      vi.mocked(browser.tabs.query).mockImplementationOnce(() => {
        throw cause;
      });
      render(<App />);

      expect(screen.getByText("Checking current page...")).toBeDefined();
      expect(screen.queryByText("⚠️ Unable to inspect page")).toBeNull();

      await act(async () => {});

      expect(screen.getByText("⚠️ Unable to inspect page")).toBeDefined();
      expect(screen.getByText("Tab query threw synchronously")).toBeDefined();
      expect(browser.scripting.executeScript).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      expect(screen.getByText("Checking current page...")).toBeDefined();
      await act(async () => {});

      expect(screen.queryByText("⚠️ Unable to inspect page")).toBeNull();
      expect(screen.getByText("Test Story")).toBeDefined();
      expect(browser.tabs.query).toHaveBeenCalledTimes(2);
    },
  );
});
