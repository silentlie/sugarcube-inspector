import type {} from "twine-sugarcube";
import type { Locator, Page } from "@playwright/test";
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

async function openVariables(page: Page) {
  const drawer = await openDrawer(page);
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  return drawer;
}

async function expandVariable(drawer: Locator, name: string) {
  const row = drawer.getByRole("treeitem", { name: new RegExp(`^${name}(?:\\s|$)`) });
  await row.locator(".MuiTreeItem-iconContainer").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  return row;
}

test("mounts the React inspector in the game's MAIN world", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const drawer = await openVariables(page);

  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("treeitem").first()).toBeVisible();
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();
  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
});

test("MUI Rich Tree View preserves scope navigation and variable inspection", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);

  const overview = drawer.getByRole("tab", { name: "Overview" });
  const variables = drawer.getByRole("tab", { name: "Variables", exact: true });
  const scripts = drawer.getByRole("tab", { name: "Scripts" });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toHaveCount(0);
  await expect(drawer.locator(".MuiTabs-root").first()).toBeVisible();
  expect(await drawer.evaluate((host) =>
    Boolean(host.shadowRoot?.querySelector('style[data-emotion^="sugarcube-mui"]')),
  )).toBe(true);

  await variables.click();
  await expect(variables).toHaveAttribute("aria-selected", "true");
  const story = drawer.getByRole("tab", { name: "Story Variables" });
  const temporary = drawer.getByRole("tab", { name: "Temporary Variables" });
  const favorites = drawer.getByRole("tab", { name: "Favorites" });
  await expect(story).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();

  await favorites.click();
  await expect(favorites).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toHaveCount(0);

  await temporary.click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();

  await overview.click();
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByRole("tab", { name: "Favorites" })).toHaveCount(0);
  await scripts.click();
  await expect(scripts).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toHaveCount(0);

  await variables.click();
  await story.click();
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
});

test("MUI Tree View exposes keyboard-controlled expansion", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const inventory = drawer.getByRole("treeitem", { name: /^inventory(?:\s|$)/ });
  await inventory.focus();
  await inventory.press("ArrowRight");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByRole("treeitem", { name: /^0(?:\s|$)/ })).toBeVisible();
  await inventory.press("ArrowLeft");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await expect(drawer.getByRole("treeitem", { name: /^0(?:\s|$)/ })).toHaveCount(0);
});

test("inspects shared live references and cycles without writes or serialization", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);

  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /^Increment / })).toHaveCount(0);

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
  await expect(drawer.getByRole("tree", { name: "Story variables tree" })).toBeVisible();
  await expect(drawer.getByRole("treeitem").first()).toBeVisible();
  await expandVariable(drawer, "player");
  await expect(drawer.getByText("health", { exact: true })).toBeVisible();
  await expect(drawer.getByText("same reference", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle("100", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, { health: number }>;
    return vars.player?.health === 100 && vars.leader?.health === 100 &&
      Object.is(vars.player, vars.leader);
  })).toBe(true);
});

test("refresh and passage navigation read the current game values", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
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
    const drawer = await openVariables(page);
    await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  }
});

test("automatically reacts to game writes without manual refresh", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.score = 44;
  });
  await expect(drawer.getByTitle("44", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.newVariable = "appeared";
  });
  await expect(drawer.getByText("newVariable", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"appeared"', { exact: true })).toBeVisible();
});

test("expanded tiles follow object replacement and nested in-place mutations", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.player = { health: 10, name: "Alex" };
  });
  await expandVariable(drawer, "player");
  await expect(drawer.getByTitle("10", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { player: { health: number } };
    store.player.health = 20;
  });
  await expect(drawer.getByTitle("20", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { player: { health: number } };
    store.player = { health: 31 };
  });
  await expect(drawer.getByRole("treeitem", { name: /^player(?:\s|$)/ }))
    .toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByTitle("31", { exact: true })).toBeVisible();
  await expect(drawer.getByText("name", { exact: true })).toHaveCount(0);
});

test("reacts to in-place array, Map and Set changes", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await expandVariable(drawer, "inventory");

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as { inventory: string[] };
    vars.inventory.push("torch");
  });
  await expect(drawer.getByTitle("Array(3)", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"torch"', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.testMap = new Map([["one", 1]]);
    store.testSet = new Set(["north"]);
  });
  await expandVariable(drawer, "testMap");
  await expect(drawer.getByTitle("1", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { testMap: Map<string, number> };
    store.testMap.set("one", 4);
  });
  await expect(drawer.getByTitle("4", { exact: true })).toBeVisible();

  await expandVariable(drawer, "testSet");
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { testSet: Set<string> };
    store.testSet.delete("north");
    store.testSet.add("south");
  });
  await expect(drawer.getByTitle('"south"', { exact: true })).toBeVisible();
});

test("offscreen tiles stop polling and refresh when scrolled back into view", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.large = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [`item${String(i).padStart(2, "0")}`, i]),
    );
  });
  await expandVariable(drawer, "large");

  const firstRow = drawer.getByRole("treeitem", { name: /^item00(?:\s|$)/ });
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow.getByTitle("0", { exact: true })).toBeVisible();

  await drawer.getByText("item79", { exact: true }).scrollIntoViewIfNeeded();
  await expect(firstRow).not.toBeInViewport();
  // Allow the IntersectionObserver to mark the first row as offscreen.
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as {
      large: Record<string, number>;
    };
    store.large.item00 = 999;
  });
  await page.waitForTimeout(600);
  await expect(firstRow.getByTitle("0", { exact: true })).toHaveCount(1);

  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow.getByTitle("999", { exact: true })).toBeVisible();
});
