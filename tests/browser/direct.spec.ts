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
  await expect(drawer.getByTitle('"north"', { exact: true }).last()).toBeVisible();
});

test("Ant Design Tree View preserves scope navigation and variable inspection", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);

  const overview = drawer.getByRole("tab", { name: "Overview" });
  const variables = drawer.getByRole("tab", { name: "Variables", exact: true });
  const scripts = drawer.getByRole("tab", { name: "Scripts" });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toBeHidden();
  await expect(drawer.locator(".ant-tabs").first()).toBeVisible();
  expect(await drawer.evaluate((host) => {
    const shadow = host.shadowRoot!;
    const styles = [...shadow.querySelectorAll("style")];
    return styles.some((style) => style.textContent?.includes(".ant-tabs")) &&
      !document.head.querySelector("style[data-emotion^='sugarcube-mui']");
  })).toBe(true);

  await variables.click();
  await expect(variables).toHaveAttribute("aria-selected", "true");
  const story = drawer.getByRole("tab", { name: "Story Variables" });
  const temporary = drawer.getByRole("tab", { name: "Temporary Variables" });
  const favorites = drawer.getByRole("tab", { name: "Favorites" });
  await expect(story).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();

  await favorites.click();
  await expect(favorites).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toBeHidden();

  await temporary.click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();

  await overview.click();
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByRole("tab", { name: "Favorites" })).toHaveCount(0);
  await scripts.click();
  await expect(scripts).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("score", { exact: true })).toBeHidden();

  await variables.click();
  await story.click();
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
});

test("tab switching preserves expansion and tree fills remaining drawer height", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const tree = drawer.getByRole("tree", { name: "Story variables tree" });
  await expandVariable(drawer, "inventory");
  await tree.evaluate((element) => { element.dataset.persistentTree = "yes"; });

  await drawer.getByRole("tab", { name: "Overview" }).click();
  await drawer.getByRole("tab", { name: "Scripts" }).click();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(tree).toHaveAttribute("data-persistent-tree", "yes");
  await expect(drawer.getByRole("treeitem", { name: /^inventory/ }))
    .toHaveAttribute("aria-expanded", "true");

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await drawer.getByRole("tab", { name: "Story Variables" }).click();
  await expect(tree).toHaveAttribute("data-persistent-tree", "yes");

  const holder = tree.locator(".ant-tree-list-holder");
  const remainingGap = async () => holder.evaluate((element) => {
    const treeBottom = element.getBoundingClientRect().bottom;
    const drawerBottom = element.closest("aside")!.getBoundingClientRect().bottom;
    return Math.abs(drawerBottom - 16 - treeBottom);
  });
  await expect.poll(remainingGap).toBeLessThan(12);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(remainingGap).toBeLessThan(12);
});

test("custom drawer retains keyboard resizing and toggle behaviour", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await expect(handle).toHaveAttribute("aria-expanded", "true");

  const width = await drawer.locator("aside").evaluate((el) =>
    Number.parseFloat((el as HTMLElement).style.width));
  await handle.press("ArrowLeft");
  await expect(drawer.locator("aside")).toHaveCSS("width", `${width + 24}px`);
  await handle.press("ArrowRight");
  await expect(drawer.locator("aside")).toHaveCSS("width", `${width}px`);

  await handle.press("Enter");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
});

test("Ant Design Tree View exposes keyboard-controlled expansion", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const inventory = drawer.getByRole("treeitem", { name: /^inventory/ });
  const tree = drawer.getByRole("tree", { name: "Story variables tree" });
  await tree.focus();
  // Ant keeps its active item on the tree root, not on individual row elements.
  await tree.press("End");
  await tree.press("ArrowRight");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByRole("treeitem", { name: /^0/ })).toBeVisible();
  await tree.press("ArrowLeft");
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
  await expect(drawer.getByTitle('"north"', { exact: true }).last()).toBeVisible();
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as { testSet: Set<string> };
    store.testSet.delete("north");
    store.testSet.add("south");
  });
  await expect(drawer.getByTitle('"south"', { exact: true }).last()).toBeVisible();
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

test("virtualized rows unsubscribe on unmount and refresh when scrolled back", async ({ page }) => {
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

  const holder = drawer.locator(".ant-tree-list-holder").first();
  await holder.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByText("item79", { exact: true })).toBeVisible();
  await expect(firstRow).toHaveCount(0);
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as {
      large: Record<string, number>;
    };
    store.large.item00 = 999;
  });
  await page.waitForTimeout(600);
  await expect(firstRow.getByTitle("0", { exact: true })).toHaveCount(0);

  await holder.evaluate((el) => { el.scrollTop = 0; });
  await expect(firstRow.getByTitle("999", { exact: true })).toBeVisible();
});

test("retained Story and Temporary trees catch up independently after being hidden", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByTitle('"north"', { exact: true }).last()).toBeVisible();
  await page.evaluate(() => {
    const state = SugarCube.State;
    (state.variables as Record<string, unknown>).score = 93;
    (state.temporary as Record<string, unknown>).choice = "east";
  });
  await expect(drawer.getByTitle('"east"', { exact: true }).last()).toBeVisible();

  await drawer.getByRole("tab", { name: "Story Variables" }).click();
  await expect(drawer.getByTitle("93", { exact: true })).toBeVisible();
});

test("retained tree catches up after its Variables tab was hidden", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();

  await drawer.getByRole("tab", { name: "Overview" }).click();
  await page.evaluate(() => {
    const variables = SugarCube.State.variables as unknown as { score: number };
    variables.score = 101;
  });
  await page.waitForTimeout(350);
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(drawer.getByTitle("101", { exact: true })).toBeVisible();
});


test("offscreen expanded object replacement refreshes its children on return", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.replaceWhileOffscreen = { before: 1 };
    for (let i = 0; i < 100; i++) {
      vars[`row${String(i).padStart(3, "0")}`] = i;
    }
  });
  await expandVariable(drawer, "replaceWhileOffscreen");
  await expect(drawer.getByText("before", { exact: true })).toBeVisible();
  const holder = drawer.locator(".ant-tree-list-holder").first();
  await holder.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByRole("treeitem", { name: /^row099/ })).toBeVisible();
  await expect(drawer.getByRole("treeitem", { name: /^replaceWhileOffscreen/ })).toHaveCount(0);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.replaceWhileOffscreen = { after: 9 };
  });
  await page.waitForTimeout(350);
  await holder.evaluate((el) => { el.scrollTop = 0; });
  await expect(drawer.getByText("after", { exact: true })).toBeVisible();
  await expect(drawer.getByText("before", { exact: true })).toHaveCount(0);

  // Also recover an in-place mutation made while the expanded parent was unmounted.
  await holder.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByRole("treeitem", { name: /^replaceWhileOffscreen/ })).toHaveCount(0);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as {
      replaceWhileOffscreen: Record<string, number>;
    };
    vars.replaceWhileOffscreen.added = 17;
  });
  await holder.evaluate((el) => { el.scrollTop = 0; });
  await expect(drawer.getByText("added", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle("17", { exact: true })).toBeVisible();
});

test("virtual tree reaches all 10,000 children without mounting offscreen rows", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.bulk = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, i) => [`item${String(i).padStart(5, "0")}`, i]),
    );
  });
  await expandVariable(drawer, "bulk");
  const virtualHolder = drawer.locator(".ant-tree-list-holder").first();
  const first = drawer.getByRole("treeitem", { name: /^item00000/ });
  await expect(first).toBeVisible();
  await virtualHolder.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(drawer.getByRole("treeitem", { name: /^item09999/ })).toBeVisible();
  await expect(first).toHaveCount(0);
  expect(await drawer.getByRole("treeitem").count()).toBeLessThan(100);
  await virtualHolder.evaluate((el) => { el.scrollTop = 0; });
  await expect(first).toBeVisible();
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
