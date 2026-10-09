import type { Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openInspector(page: Page) {
  const inspector = page.locator("sugarcube-inspector");
  await expect(inspector).toHaveCount(1);
  const handle = inspector.getByRole("button", {
    name: "Resize SugarCube Inspector",
  });
  if ((await handle.getAttribute("aria-expanded")) !== "true") {
    await handle.press("Enter");
  }
  await handle.hover();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect(
    inspector.getByRole("heading", {
      name: "Inspector Smoke Story",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Refresh snapshot", exact: true }),
  ).toBeEnabled();
  await expect(
    inspector.getByText("Inspector Error", { exact: true }),
  ).toHaveCount(0);
  return inspector;
}

test("initializes the real page bridge and displays the initial snapshot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const inspector = await openInspector(page);

  await expect(
    inspector.getByRole("button", {
      name: "Pin inspector (coming soon)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    inspector.getByRole("tab", { name: "Story Variables", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByRole("tabpanel")).toHaveCount(1);
  const storyVariables = inspector.getByRole("tabpanel", {
    name: "Story Variables",
    exact: true,
  });
  await expect(
    storyVariables.getByText("score", { exact: true }),
  ).toBeVisible();
  await expect(storyVariables.getByTitle("7", { exact: true })).toBeVisible();
  await expect(
    storyVariables.getByTitle('"initial"', { exact: true }),
  ).toBeVisible();

  await inspector
    .getByRole("tab", { name: "Temporary Variables", exact: true })
    .click();
  await expect(storyVariables).toBeHidden();
  const temporaryVariables = inspector.getByRole("tabpanel", {
    name: "Temporary Variables",
    exact: true,
  });
  await expect(
    temporaryVariables.getByText("choice", { exact: true }),
  ).toBeVisible();
  await expect(
    temporaryVariables.getByTitle('"north"', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("automatically updates variables after an actual SugarCube passage change", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(storyUrl);
  const inspector = await openInspector(page);

  await page
    .locator("#passages")
    .getByRole("link", { name: "Continue", exact: true })
    .click();
  await inspector
    .getByRole("button", { name: "Resize SugarCube Inspector" })
    .hover();

  await expect(page.locator("#passages")).toContainText("Passage changed.");
  const storyVariables = inspector.getByRole("tabpanel", {
    name: "Story Variables",
    exact: true,
  });
  await expect(
    storyVariables.getByText("score", { exact: true }),
  ).toBeVisible();
  await expect(storyVariables.getByTitle("12", { exact: true })).toBeVisible();
  await expect(
    storyVariables.getByTitle('"updated"', { exact: true }),
  ).toBeVisible();
  await inspector
    .getByRole("tab", { name: "Temporary Variables", exact: true })
    .click();
  await expect(
    inspector
      .getByRole("tabpanel", { name: "Temporary Variables", exact: true })
      .getByTitle('"south"', { exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Refresh snapshot", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("reinitializes on five consecutive reloads with one working inspector", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(storyUrl);

  for (let reload = 0; reload < 5; reload++) {
    await page.reload();
    const inspector = await openInspector(page);
    const variables = inspector.getByRole("tabpanel", {
      name: "Story Variables",
      exact: true,
    });
    await expect(variables.getByTitle("7", { exact: true })).toBeVisible();
    await inspector
      .getByRole("button", { name: "Refresh snapshot", exact: true })
      .click();
    await expect(
      inspector.getByRole("button", { name: "Refresh snapshot", exact: true }),
    ).toBeEnabled();
    await expect(
      variables.getByTitle('"initial"', { exact: true }),
    ).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test("switches variable scopes with keyboard navigation and moves focus", async ({
  page,
}) => {
  await page.goto(storyUrl);
  const inspector = await openInspector(page);
  const storyTab = inspector.getByRole("tab", {
    name: "Story Variables",
    exact: true,
  });
  const temporaryTab = inspector.getByRole("tab", {
    name: "Temporary Variables",
    exact: true,
  });

  await storyTab.focus();
  await storyTab.press("ArrowLeft");
  await expect(temporaryTab).toBeFocused();
  await expect(temporaryTab).toHaveAttribute("aria-selected", "true");
  await expect(temporaryTab).toHaveAttribute("tabindex", "0");
  await expect(storyTab).toHaveAttribute("tabindex", "-1");
  await expect(
    inspector.getByRole("tabpanel", {
      name: "Temporary Variables",
      exact: true,
    }),
  ).toBeVisible();

  await temporaryTab.press("ArrowRight");
  await expect(storyTab).toBeFocused();
  await expect(storyTab).toHaveAttribute("aria-selected", "true");
  await storyTab.press("End");
  await expect(temporaryTab).toBeFocused();
  await temporaryTab.press("Home");
  await expect(storyTab).toBeFocused();
  await expect(inspector.getByRole("tabpanel")).toHaveCount(1);
});

test("keeps independent tree expansion and the selected scope across snapshot updates", async ({
  page,
}) => {
  await page.goto(storyUrl);
  const inspector = await openInspector(page);
  const storyTab = inspector.getByRole("tab", {
    name: "Story Variables",
    exact: true,
  });
  const temporaryTab = inspector.getByRole("tab", {
    name: "Temporary Variables",
    exact: true,
  });
  const storyPanel = inspector.getByRole("tabpanel", {
    name: "Story Variables",
    exact: true,
  });
  const temporaryPanel = inspector.getByRole("tabpanel", {
    name: "Temporary Variables",
    exact: true,
  });

  await storyPanel
    .getByRole("button", { name: "Expand inventory", exact: true })
    .click();
  await expect(storyPanel.getByTitle('"map"', { exact: true })).toBeVisible();
  await temporaryTab.click();
  await expect(
    temporaryPanel.getByRole("button", {
      name: "Expand inventory",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await temporaryPanel
    .getByRole("button", { name: "Expand inventory", exact: true })
    .click();
  await expect(
    temporaryPanel.getByTitle('"compass"', { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    SugarCube.State.temporary.inventory = ["manual refresh"];
  });
  await inspector
    .getByRole("button", { name: "Refresh snapshot", exact: true })
    .click();
  await expect(
    temporaryPanel.getByTitle('"manual refresh"', { exact: true }),
  ).toBeVisible();
  await expect(temporaryTab).toHaveAttribute("aria-selected", "true");
  await expect(
    temporaryPanel.getByRole("button", {
      name: "Collapse inventory",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");

  await page
    .locator("#passages")
    .getByRole("link", { name: "Continue", exact: true })
    .click();
  await inspector
    .getByRole("button", { name: "Resize SugarCube Inspector" })
    .hover();
  await expect(
    temporaryPanel.getByTitle('"rope"', { exact: true }),
  ).toBeVisible();
  await expect(temporaryTab).toHaveAttribute("aria-selected", "true");
  await storyTab.click();
  await expect(
    storyPanel.getByRole("button", { name: "Collapse inventory", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(storyPanel.getByTitle('"torch"', { exact: true })).toBeVisible();
});

test("shows a snapshot error and recovers through Retry using the real bridge", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(storyUrl);
  const inspector = await openInspector(page);

  await page.evaluate(() => {
    Object.assign(SugarCube.State.variables, { uncloneable: () => {} });
  });
  await inspector
    .getByRole("button", { name: "Refresh snapshot", exact: true })
    .click();
  await expect(
    inspector.getByRole("heading", { name: "Inspector Error", exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("heading", {
      name: "Inspector Smoke Story",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Refresh snapshot", exact: true }),
  ).toBeDisabled();
  await expect(inspector.getByRole("tablist")).toHaveCount(0);

  await page.evaluate(() => {
    Reflect.deleteProperty(SugarCube.State.variables, "uncloneable");
  });
  await inspector.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    inspector.getByRole("button", { name: "Refresh snapshot", exact: true }),
  ).toBeEnabled();
  await expect(
    inspector.getByRole("heading", { name: "Inspector Error", exact: true }),
  ).toHaveCount(0);
  await expect(
    inspector
      .getByRole("tabpanel", { name: "Story Variables", exact: true })
      .getByTitle("7", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
