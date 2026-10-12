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
  const row = drawer.getByRole("treeitem", { name: new RegExp(`^${name}`) });
  await row.locator(".ant-tree-switcher").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  return row;
}

test("mounts the React inspector in the game's MAIN world", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const drawer = await openVariables(page);

  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("treeitem").first()).toBeVisible();
  await expect(drawer.getByRole("tree", { name: "Story variables tree" })).toHaveClass(/ant-tree/);
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();
  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
});

test("Ant Design Tree View preserves scope navigation and variable inspection", async ({ page }) => {
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

test("Ant Design Tree View exposes keyboard-controlled expansion", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const inventory = drawer.getByRole("treeitem", { name: /^inventory/ });
  await inventory.focus();
  await inventory.press("ArrowRight");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByRole("treeitem", { name: /^0/ })).toBeVisible();
  await inventory.press("ArrowLeft");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await expect(drawer.getByRole("treeitem", { name: /^0/ })).toHaveCount(0);
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
  await expect(drawer.getByRole("treeitem", { name: /^player/ }))
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
  const mapEntry = drawer.getByRole("treeitem", { name: /^"one"/ });
  await expect(mapEntry).toBeVisible();
  await expect(mapEntry.getByTitle("1", { exact: true })).toBeVisible();
  await mapEntry.locator(".ant-tree-switcher").click();
  await expect(drawer.getByRole("treeitem", { name: /^key/ })).toBeVisible();
  await expect(drawer.getByRole("treeitem", { name: /^value/ })).toBeVisible();
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { testMap: Map<string, number> };
    store.testMap.set("one", 4);
  });
  await expect(drawer.getByRole("treeitem", { name: /^value/ })
    .getByTitle("4", { exact: true })).toBeVisible();

  await expandVariable(drawer, "testSet");
  await expect(drawer.getByTitle('"north"', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { testSet: Set<string> };
    store.testSet.delete("north");
    store.testSet.add("south");
  });
  await expect(drawer.getByTitle('"south"', { exact: true })).toBeVisible();
});

test("Map object keys and values can each expand independently", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.objectMap = new Map([[{ label: "hero" }, { health: 30 }]]);
  });
  await expandVariable(drawer, "objectMap");
  const entry = drawer.getByRole("treeitem", { name: /^\{…\}/ });
  await entry.locator(".ant-tree-switcher").click();
  const keyRow = drawer.getByRole("treeitem", { name: /^key/ });
  const valueRow = drawer.getByRole("treeitem", { name: /^value/ });
  await keyRow.locator(".ant-tree-switcher").click();
  await valueRow.locator(".ant-tree-switcher").click();
  await expect(drawer.getByText("label", { exact: true })).toBeVisible();
  await expect(drawer.getByText("health", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as { objectMap: Map<object, { health: number }> };
    const key = [...vars.objectMap.keys()][0]!;
    vars.objectMap.set(key, { health: 90 });
  });
  await expect(drawer.getByTitle("90", { exact: true })).toBeVisible();
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

  const firstRow = drawer.getByRole("treeitem", { name: /^item00/ });
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow.getByTitle("0", { exact: true })).toBeVisible();

  await drawer.getByText("item79", { exact: true }).scrollIntoViewIfNeeded();
  await expect(firstRow).toHaveCount(0);
  // Allow the IntersectionObserver to mark the first row as offscreen.
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as {
      large: Record<string, number>;
    };
    store.large.item00 = 999;
  });
  await page.waitForTimeout(600);
  await expect(firstRow.getByTitle("0", { exact: true })).toHaveCount(0);

  await drawer.locator(".rc-virtual-list-holder").evaluate((el) => { el.scrollTop = 0; });
  await expect(firstRow.getByTitle("999", { exact: true })).toBeVisible();
});

test("Ant Design Tree exposes all children without pagination", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.bulk = Object.fromEntries(
      Array.from({ length: 125 }, (_, i) => [`item${String(i).padStart(3, "0")}`, i]),
    );
  });
  await expandVariable(drawer, "bulk");
  const virtualHolder = drawer.locator(".rc-virtual-list-holder").first();
  await virtualHolder.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByText("item124", { exact: true })).toBeVisible();
  expect(await drawer.getByRole("treeitem").count()).toBeLessThan(100);
  await expect(drawer.getByRole("button", { name: /Load more/ })).toHaveCount(0);
});


test("renders boxed primitives without crashing the tree", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const variables = SugarCube.State.variables as unknown as Record<string, unknown>;
    variables.boxedFixtures = {
      number: new Number(123),
      string: new String("abc"),
      boolean: new Boolean(false),
      bigint: Object(42n),
      symbol: Object(Symbol("sample")),
    };
  });

  await expandVariable(drawer, "boxedFixtures");
  for (const [name, type, expected] of [
    ["number", "Number", "123"],
    ["string", "String", '"abc"'],
    ["boolean", "Boolean", "false"],
    ["bigint", "BigInt", "42"],
    ["symbol", "Symbol", "Symbol(sample)"],
  ] as const) {
    const row = drawer.getByRole("treeitem", { name: new RegExp(`^${name}`) });
    await expect(row.locator(".token.class-name").first()).toHaveText(type);
    await expect(row.getByTitle(expected, { exact: true })).toBeVisible();
  }
  await expect(drawer.getByRole("tree", { name: "Story variables tree" })).toBeVisible();
});

test("renders VS Code-style type labels and value token colors", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const score = drawer.getByText("score", { exact: true }).locator("..");
  await expect(score.locator(".token.keyword")).toHaveText("number");
  await expect(score.locator(".token.number")).toHaveText("7");

  const [typeColor, valueColor] = await score.locator(".token").evaluateAll(
    (nodes) => nodes.map((node) => getComputedStyle(node).color),
  );
  expect(typeColor).not.toBe(valueColor);

  const inventory = drawer.getByText("inventory", { exact: true }).locator("..");
  await expect(inventory.locator(".token.class-name")).toHaveText("Array");
  const inventoryPreview = inventory.locator('[title="Array(2)"]');
  await expect(inventoryPreview).toHaveText("(2)");
  await expect(inventoryPreview.locator(".token.punctuation")).toHaveText(["(", ")"]);
  await expect(inventoryPreview.locator(".token.number")).toHaveText("2");
});
