import type {} from "twine-sugarcube";
import type { Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openDrawer(page: Page) {
  const drawer = page.locator("sugarcube-inspector");
  await expect(drawer).toHaveCount(1);
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();
  await expect(drawer.getByText("MAIN world", { exact: true })).toBeVisible();
  return drawer;
}

test("uses MAIN-world inspection without a serialized snapshot", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const drawer = await openDrawer(page);
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Story Variables" })).toBeVisible();

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
});

test("refresh retrieves current game values without functions breaking inspection", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.score = 55;
    vars.uncloneable = () => 1;
  });

  await drawer.getByRole("button", { name: "Refresh variables" }).click();
  await expect(drawer.getByTitle("55", { exact: true })).toBeVisible();
  await expect(drawer.getByText("uncloneable", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle("[Function]", { exact: true })).toBeVisible();
});

test("reinitializes a single drawer after page reload", async ({ page }) => {
  await page.goto(storyUrl);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await page.reload();
    const drawer = await openDrawer(page);
    await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  }
});
