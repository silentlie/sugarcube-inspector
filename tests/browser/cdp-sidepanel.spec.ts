import { readFile } from "node:fs/promises";
import { expect, storyUrl, test } from "./fixtures";

test("ships no page-injected snapshot inspector", async () => {
  const manifest = JSON.parse(await readFile(
    new URL("../../.output/chrome-mv3/manifest.json", import.meta.url),
    "utf8",
  )) as { content_scripts?: unknown[]; permissions?: string[] };
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect(manifest.permissions).toContain("debugger");
});

test("loads a real SugarCube story without mounting a page drawer", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  await expect(page.locator("sugarcube-inspector")).toHaveCount(0);
  const score = await page.evaluate(() => {
    const game = globalThis as typeof globalThis & {
      SugarCube?: { State: { variables: { score: number } } };
    };
    return game.SugarCube?.State.variables.score;
  });
  expect(score).toBe(7);

  await page.locator("#passages").getByRole("link", { name: "Continue" }).click();
  await expect(page.locator("#passages")).toContainText("Passage changed.");
  await expect(page.locator("sugarcube-inspector")).toHaveCount(0);
});
