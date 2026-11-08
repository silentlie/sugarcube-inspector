// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "../entrypoints/background";

const url = "https://inspector.test/story";

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal("location", { href: url });
  vi.spyOn(browser.scripting, "executeScript").mockImplementation(async (injection) => [
    { frameId: 0, documentId: "story-document", result: injection.func
      ? Reflect.apply(injection.func, undefined, "args" in injection ? injection.args : []) : undefined },
  ]);
  background.main();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fakeBrowser.reset();
  document.body.innerHTML = "";
});

it.each([
  { page: "a non-SugarCube page", html: "" },
  { page: "an already-inspected story", html: '<tw-storydata format="SugarCube"></tw-storydata><sugarcube-inspector></sugarcube-inspector>' },
])("does not inject content files into $page", async ({ html }) => {
  document.body.innerHTML = html;
  await fakeBrowser.action.onClicked.trigger(await fakeBrowser.tabs.create({ url }));
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
});

it("targets both content scripts at the probed document", async () => {
  document.body.innerHTML = '<tw-storydata format="SugarCube"></tw-storydata>';
  const execute = browser.scripting.executeScript;
  const tab = await fakeBrowser.tabs.create({ url });
  await fakeBrowser.action.onClicked.trigger(tab);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
  expect(execute).toHaveBeenNthCalledWith(2, {
    target: { tabId: tab.id, documentIds: ["story-document"] },
    files: ["/content-scripts/favorite-storage.js"],
  });
  expect(execute).toHaveBeenNthCalledWith(3, {
    target: { tabId: tab.id, documentIds: ["story-document"] },
    files: ["/content-scripts/content.js"], world: "MAIN",
  });
});

const update = {
  type: "sugarcube-inspector:favorite-update",
  ifid: "example-story",
  detail: '[{"root":"variables","path":["score"]}]',
  pinned: true,
};

it.each([
  { reason: "missing sender tab", sender: { tab: undefined }, message: update },
  { reason: "subframe sender", sender: { frameId: 1 }, message: update },
  { reason: "missing sender URL", sender: { url: undefined }, message: update },
  { reason: "wrong message type", sender: {}, message: { ...update, type: "other" } },
  { reason: "invalid payload", sender: {}, message: { ...update, pinned: "true" } },
  { reason: "invalid story identifier", sender: {}, message: { ...update, ifid: "../invalid" } },
])("does not relay favorites with $reason", async ({ sender, message }) => {
  const query = vi.spyOn(browser.tabs, "query");
  const send = vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue(undefined);
  await fakeBrowser.runtime.onMessage.trigger(message, {
    tab: await fakeBrowser.tabs.get(0), frameId: 0, url, ...sender,
  }, vi.fn());
  expect(query).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("relays to other tabs even when one recipient rejects the message", async () => {
  const sender = await fakeBrowser.tabs.get(0);
  const unavailable = await fakeBrowser.tabs.create({ url });
  const recipient = await fakeBrowser.tabs.create({ url });
  const send = vi.spyOn(browser.tabs, "sendMessage")
    .mockRejectedValueOnce(new Error("No receiver"))
    .mockResolvedValue(undefined);

  await fakeBrowser.runtime.onMessage.trigger(
    { ...update, group: "favorites:https://untrusted.test:other-story:" },
    { tab: sender, frameId: 0, url },
    vi.fn(),
  );

  const expected = {
    type: "sugarcube-inspector:favorite-update",
    group: "favorites:https://inspector.test:example-story:",
    detail: '[{"root":"variables","path":["score"]}]',
    pinned: true,
  };
  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenCalledWith(unavailable.id, expected);
  expect(send).toHaveBeenCalledWith(recipient.id, expected);
});
