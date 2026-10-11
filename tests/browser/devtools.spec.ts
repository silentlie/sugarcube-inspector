import { readFile } from "node:fs/promises";
import { expect, storyUrl, test } from "./fixtures";

test("builds a DevTools-only inspector without a debugger permission or injected content scripts", async () => {
  const manifest = JSON.parse(await readFile(
    new URL("../../.output/chrome-mv3/manifest.json", import.meta.url), "utf8",
  )) as {
    devtools_page?: string;
    permissions?: string[];
    content_scripts?: unknown[];
    side_panel?: unknown;
  };
  expect(manifest.devtools_page).toBe("devtools.html");
  expect(manifest.permissions ?? []).not.toContain("debugger");
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect(manifest.side_panel).toBeUndefined();
  const panel = await readFile(
    new URL("../../.output/chrome-mv3/sugarcube-panel.html", import.meta.url),
    "utf8",
  );
  expect(panel).toContain("SugarCube Inspector");
});

test("does not inject an inspector drawer into the SugarCube story", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  await expect(page.locator("sugarcube-inspector")).toHaveCount(0);

  await page.locator("#passages").getByRole("link", { name: "Continue" }).click();
  await expect(page.locator("#passages")).toContainText("Passage changed.");
  await expect(page.locator("sugarcube-inspector")).toHaveCount(0);
});
