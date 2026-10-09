import type { Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openInspector(page: Page) {
  const inspector = page.locator("sugarcube-inspector");
  await expect(inspector).toHaveCount(1);
  await inspector.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
  await expect(inspector.getByRole("heading", { name: "SugarCube Inspector", exact: true })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await expect(inspector.getByText("Inspector Error", { exact: true })).toHaveCount(0);
  return inspector;
}

test("initializes the real page bridge and displays the initial snapshot", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const inspector = await openInspector(page);

  await expect(inspector).toContainText("Inspector Smoke Story");
  const storyVariables = inspector.locator("section").filter({ hasText: "Story Variables" });
  await expect(storyVariables).toContainText(/score:\s*7/);
  await expect(storyVariables).toContainText("initial");
  await expect(inspector.locator("section").filter({ hasText: "Temporary Variables" })).toContainText("north");
  expect(errors).toEqual([]);
});

test("automatically updates variables after an actual SugarCube passage change", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(storyUrl);
  const inspector = await openInspector(page);

  await page.locator("#passages").getByRole("link", { name: "Continue", exact: true }).click();

  await expect(page.locator("#passages")).toContainText("Passage changed.");
  const storyVariables = inspector.locator("section").filter({ hasText: "Story Variables" });
  await expect(storyVariables).toContainText(/score:\s*12/);
  await expect(storyVariables).toContainText("updated");
  await expect(inspector.locator("section").filter({ hasText: "Temporary Variables" })).toContainText("south");
  await expect(inspector.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("reinitializes on five consecutive reloads with one working inspector", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(storyUrl);

  for (let reload = 0; reload < 5; reload++) {
    await page.reload();
    const inspector = await openInspector(page);
    const variables = inspector.locator("section").filter({ hasText: "Story Variables" });
    await expect(variables).toContainText(/score:\s*7/);
    await inspector.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(inspector.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
    await expect(variables).toContainText("initial");
  }

  expect(errors).toEqual([]);
});
