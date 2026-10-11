import type { Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openDrawer(page: Page) {
  const drawer = page.locator("sugarcube-inspector");
  await expect(drawer).toHaveCount(1);
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();
  await expect(drawer.getByText("MAIN world · direct references", { exact: true })).toBeVisible();
  return drawer;
}

test("mounts the React inspector in the game's MAIN world", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const drawer = await openDrawer(page);

  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();
  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
});

test("the UI edits the actual game object without messaging or serialization", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);

  await drawer.getByRole("button", { name: "Increment score" }).click();
  await expect(drawer.getByTitle("8", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => SugarCube.State.variables.score)).toBe(8);

  // A function and an object with circular references are not serializable
  // through ordinary JSON, but direct inspection still works.
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    const player = { health: 100 } as Record<string, unknown>;
    player.self = player;
    vars.player = player;
    vars.leader = player;
    vars.uncloneable = () => 42;
  });
  await drawer.getByRole("button", { name: "Refresh variables" }).click();
  await expect(drawer.getByText("uncloneable", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Expand player" }).click();
  await expect(drawer.getByText("health", { exact: true })).toBeVisible();
  await expect(drawer.getByText("same reference", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Increment health" }).click();
  expect(await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, { health: number }>;
    return vars.player.health === 101 && vars.leader.health === 101 &&
      Object.is(vars.player, vars.leader);
  })).toBe(true);
});

test("refresh and passage navigation read the current game values", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);
  await page.locator("#passages").getByRole("link", { name: "Continue" }).click();
  await expect(page.locator("#passages")).toContainText("Passage changed.");
  await expect(drawer.getByTitle("12", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Refresh variables" }).click();
  await expect(drawer.getByTitle("12", { exact: true })).toBeVisible();
});

test("a page reload replaces the prior MAIN-world inspector", async ({ page }) => {
  await page.goto(storyUrl);
  for (let i = 0; i < 3; i++) {
    if (i) await page.reload();
    const drawer = await openDrawer(page);
    await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  }
});
