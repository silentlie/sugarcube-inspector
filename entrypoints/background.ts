import { browser } from "wxt/browser";

async function inspectHostedStory(tabId: number, url: string) {
  const [story] = await browser.scripting.executeScript({
    target: { tabId },
    args: [url],
    func: (clickedUrl) => location.href === clickedUrl &&
      !!document.querySelector('tw-storydata[format="SugarCube"]') &&
      !document.querySelector("sugarcube-inspector"),
  });
  if (!story?.result || !story.documentId) return;

  // A navigation between these calls must not inject into a different document.
  const target = { tabId, documentIds: [story.documentId] };
  await browser.scripting.executeScript({ target, files: ["/content-scripts/favorite-storage.js"] });
  await browser.scripting.executeScript({ target, files: ["/content-scripts/content.js"], world: "MAIN" });
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(({ id, url }) => {
    if (id === undefined || !url || !/^https?:\/\//.test(url)) return;
    void inspectHostedStory(id, url).catch((error: unknown) => {
      console.warn("SugarCube Inspector could not inspect this tab.", error);
    });
  });
});
