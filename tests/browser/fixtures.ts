import { chromium, test as base, type BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";

const extensionPath = fileURLToPath(new URL("../../.output/chrome-mv3/", import.meta.url));
export const storyUrl = new URL(".generated/story.html", import.meta.url).href;

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});

export const expect = test.expect;
