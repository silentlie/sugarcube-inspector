import type {} from "twine-sugarcube";
import { copyFile, mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("hosts opt in through the extension action for the current document", async ({ page }) => {
  const hostedUrl = "https://inspector.test/story";
  await page.route(hostedUrl, async (route) => route.fulfill({
    contentType: "text/html", body: await readFile(new URL(storyUrl), "utf8"),
  }));
  await page.goto(hostedUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const host = page.locator("sugarcube-inspector");
  await expect(host).toHaveCount(0);

  const browser = page.context().browser();
  expect(browser).not.toBeNull();
  const cdp = await browser!.newBrowserCDPSession();
  const { extensions } = await cdp.send("Extensions.getExtensions");
  const extension = extensions.find(({ name }) => name.startsWith("SugarCube Inspector"));
  expect(extension).toBeDefined();
  const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const tab = targetInfos.find(({ url }) => url === hostedUrl);
  expect(tab).toBeDefined();
  const triggerAction = () => cdp.send("Extensions.triggerAction", { id: extension!.id, targetId: tab!.targetId });

  await triggerAction();
  await expect(host.getByRole("region", { name: "Story overview" })).toBeVisible();
  await host.getByRole("tab", { name: "Variables", exact: true }).click();
  await host.getByRole("button", { name: "Add score to favorites" }).click();
  const saved = await page.evaluate(() => SugarCube.Save.base64.save());

  await page.reload();
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  await page.evaluate((saved) => SugarCube.Save.base64.load(saved), saved);
  await expect(host).toHaveCount(0);
  await triggerAction();
  await host.getByRole("tab", { name: "Variables", exact: true }).click();
  await host.getByRole("tab", { name: "Favorites" }).click();
  await expect(host.getByText("$score", { exact: true })).toBeVisible();
});

test("mounts the React inspector in the game's MAIN world", async ({ page }) => {
  await page.goto(storyUrl);
  await expect(page.locator("#passages")).toContainText("Smoke story ready.");
  const drawer = await openVariables(page);

  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("treeitem").first()).toBeVisible();
  await expect(drawer.getByRole("tree", { name: "Story variables tree" })).toHaveClass(/ant-tree/);
  await expect(drawer.getByTitle("7", { exact: true })).toBeVisible();

  const inventory = drawer.getByRole("treeitem", { name: /^inventory/ });
  await expect(inventory.locator(".ant-tree-switcher svg.lucide-chevron-right")).toBeVisible();
  await inventory.locator(".ant-tree-switcher").click();
  await expect(inventory.locator(".ant-tree-switcher svg.lucide-chevron-down")).toBeVisible();

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await expect(drawer.getByText("choice", { exact: true })).toBeVisible();
  await expect(drawer.getByTitle('"north"', { exact: true }).last()).toBeVisible();
});

test("edits top-level primitive values in the live story and temporary stores", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => {
    SugarCube.State.setVar("$ready", false);
    SugarCube.State.setVar("$offset", -0);
    Object.defineProperty(SugarCube.State.variables, "readOnly", { value: 1, enumerable: true, configurable: true });
  });
  const drawer = await openVariables(page);

  const readOnlyTile = drawer.getByRole("button", { name: /^readOnly\s*:/ });
  await expect(readOnlyTile).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(SugarCube.State.variables, "readOnly", { writable: true }));
  await expect(readOnlyTile).toBeVisible();
  await page.evaluate(() => Object.defineProperty(SugarCube.State.variables, "readOnly", { writable: false }));
  await expect(readOnlyTile).toHaveCount(0);
  const scoreTile = drawer.getByRole("button", { name: /^score\s*:/ });
  await scoreTile.getByText("score", { exact: true }).click();
  const score = drawer.getByRole("textbox", { name: "New value for score" });
  await score.fill("invalid");
  await score.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("finite number");
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(7);
  await page.evaluate(() => SugarCube.State.setVar("$score", 10));
  await score.fill("21.5");
  await score.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("Value changed");
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(10);
  await score.press("Escape");
  await expect(drawer.getByTitle("10", { exact: true })).toBeVisible();
  await scoreTile.click();
  await score.fill("21.5");
  await score.press("Enter");
  await expect(drawer.getByTitle("21.5", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(21.5);

  await drawer.getByRole("button", { name: /^ready\s*:/ }).click();
  await drawer.getByRole("combobox", { name: "New value for ready" }).selectOption("true");
  await drawer.getByRole("button", { name: "Save value" }).click();
  expect(await page.evaluate(() => SugarCube.State.getVar("$ready"))).toBe(true);

  await drawer.getByRole("button", { name: /^offset\s*:/ }).click();
  await drawer.getByRole("button", { name: "Save value" }).click();
  expect(await page.evaluate(() => Object.is(SugarCube.State.getVar("$offset"), -0))).toBe(true);

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  const choiceTile = drawer.getByRole("button", { name: /^choice\s*:/ });
  await choiceTile.click();
  const choice = drawer.getByRole("textbox", { name: "New value for choice" });
  await choice.fill("discard this");
  await choice.press("Escape");
  expect(await page.evaluate(() => SugarCube.State.temporary.choice)).toBe("north");
  await choiceTile.click();
  await choice.fill("north\nwest");
  await drawer.getByRole("button", { name: "Save value" }).click();
  expect(await page.evaluate(() => SugarCube.State.temporary.choice)).toBe("north\nwest");

  await choiceTile.click();
  await page.evaluate(() => SugarCube.State.setVar("_choice", null));
  await expect(choiceTile).toHaveCount(0);
  await choice.press("Escape");
  const choiceLabel = drawer.getByText("choice", { exact: true });
  await expect(choiceLabel.locator("xpath=../..")).toBeFocused();
});

test("expands containers and edits nested primitive tiles without a pencil", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => SugarCube.State.setVar("$player", { stats: { health: 10 } }));
  const drawer = await openVariables(page);
  const player = drawer.getByRole("button", { name: /^player\s*:/ });
  await expect(player).toBeVisible();
  await player.click();
  const stats = drawer.getByRole("button", { name: /^stats\s*:/ });
  await stats.click();
  await expect(drawer.getByRole("textbox", { name: /^New value/ })).toHaveCount(0);

  const health = drawer.getByRole("button", { name: /^health\s*:/ });
  await health.press("Enter");
  const editor = drawer.getByRole("textbox", { name: "New value for health" });
  await editor.fill("25");
  await editor.press("Enter");
  await expect(health).toBeFocused();
  expect(await page.evaluate(() => SugarCube.State.getVar("$player.stats.health"))).toBe(25);
  await expect(health.getByTitle("25", { exact: true })).toBeVisible();

  await health.getByText("health", { exact: true }).click();
  await editor.fill("35");
  const values = await editor.evaluate((input: HTMLInputElement) => {
    const oldStats = SugarCube.State.getVar("$player.stats") as { health: number };
    SugarCube.State.setVar("$player.stats", { health: 25 });
    input.form!.requestSubmit();
    return [oldStats.health, SugarCube.State.getVar("$player.stats.health")];
  });
  expect(values).toEqual([25, 25]);
  await expect(editor).toHaveCount(0);

  await drawer.getByRole("button", { name: /^inventory\s*:/ }).click();
  await expect(drawer.getByRole("button", { name: /^length\s*:/ })).toHaveCount(0);
  const item = drawer.getByRole("button", { name: /^0\s*:/ });
  await item.getByText("0", { exact: true }).click();
  await drawer.getByRole("textbox", { name: "New value for 0" }).fill("lantern");
  await drawer.getByRole("button", { name: "Save value" }).click();
  expect(await page.evaluate(() => SugarCube.State.getVar("$inventory[0]"))).toBe("lantern");
  await expect(drawer.locator("svg.lucide-pencil")).toHaveCount(0);
});

test("undoes the last inspector edit and refuses to overwrite a later game change", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const score = drawer.getByRole("button", { name: /^score\s*:/ });
  const undo = drawer.getByRole("button", { name: "Undo Last Edit", exact: true });
  await expect(undo).toBeDisabled();
  await score.click();
  const draft = drawer.getByRole("textbox", { name: "New value for score" });
  await draft.fill("15");
  await draft.press("Enter");
  await undo.click();
  await expect(undo).toBeDisabled();
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(7);
  await expect(score.getByTitle("7", { exact: true })).toBeVisible();

  await score.click();
  await draft.fill("16");
  await draft.press("Enter");
  await page.evaluate(() => SugarCube.State.setVar("$score", 19));
  await undo.click();
  await expect(drawer.getByRole("alert")).toContainText("Value changed");
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(19);

  await expect(score.getByTitle("19", { exact: true })).toBeVisible();
  await score.click();
  await draft.fill("20");
  await draft.press("Enter");
  await page.getByRole("link", { name: "Continue" }).click();
  await openVariables(page);
  await undo.click();
  await expect(drawer.getByRole("alert")).toContainText("passage changed");
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(12);
});

test("locks a nested primitive across game writes and releases it on unlock or removal", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => SugarCube.State.setVar("$player", { health: 10 }));
  const drawer = await openVariables(page);
  await expandVariable(drawer, "player");
  const lock = drawer.getByRole("button", { name: "Lock health", exact: true });
  await expect(lock).toBeVisible();
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(drawer.getByRole("button", { name: /^health\s*:/ })).toHaveCount(0);

  await drawer.getByRole("tab", { name: "Overview" }).click();
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => SugarCube.State.setVar("$player", { health: 7 }));
  const read = () => page.evaluate(() => SugarCube.State.getVar("$player.health"));
  await expect.poll(read).toBe(10);
  const writeResult = await page.evaluate(() => {
    const player = SugarCube.State.getVar("$player") as { health: number };
    player.health = 5;
    return [player.health, Object.getOwnPropertyDescriptor(player, "health")?.writable];
  });
  expect(writeResult).toEqual([5, true]);
  await expect.poll(read).toBe(10);

  await openVariables(page);
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => SugarCube.State.setVar("$player.health", 4));
  await expect(drawer.getByTitle("4", { exact: true })).toBeVisible();
  expect(await read()).toBe(4);

  await lock.click();
  await page.evaluate(() => SugarCube.State.setVar("$player", {}));
  await expect(lock).toHaveCount(0);
  await page.evaluate(() => SugarCube.State.setVar("$player.health", 2));
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect(drawer.getByTitle("2", { exact: true })).toBeVisible();
  expect(await read()).toBe(2);

  await drawer.getByRole("button", { name: "Add player to favorites" }).click();
  const favoritesTab = drawer.getByRole("tab", { name: "Favorites" });
  const storyTab = drawer.getByRole("tab", { name: "Story Variables" });
  await favoritesTab.click();
  await expandVariable(drawer, "\\$player");
  await drawer.getByRole("button", { name: /^health\s*:/ }).click();
  const draft = drawer.getByRole("textbox", { name: "New value for health" });
  await draft.fill("20");
  await storyTab.click();
  await lock.click();
  await favoritesTab.click();
  await expect(draft).toHaveCount(0);
  await lock.click();
  await expect(draft).toHaveCount(0);
});

test("keeps the earlier lock when two variable paths converge on the same property", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => {
    SugarCube.State.setVar("$player", { health: 10 });
    SugarCube.State.setVar("$leader", { health: 20 });
  });
  const drawer = await openVariables(page);
  await expandVariable(drawer, "player");
  await expandVariable(drawer, "leader");
  const [playerLock, leaderLock] = [0, 1].map((index) =>
    drawer.getByRole("button", { name: "Lock health", exact: true }).nth(index));
  await playerLock!.click();
  await leaderLock!.click();

  await page.evaluate(() => {
    SugarCube.State.setVar("$leader", SugarCube.State.getVar("$player"));
    SugarCube.State.setVar("$player.health", 3);
  });
  await expect(leaderLock!).toHaveAttribute("aria-pressed", "false");
  await expect(playerLock!).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => SugarCube.State.getVar("$leader.health"))).toBe(10);

  await drawer.getByRole("button", { name: /^health\s*:/ }).click();
  const draft = drawer.getByRole("textbox", { name: "New value for health" });
  await draft.fill("8");
  await draft.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("Unlock the value");
  expect(await page.evaluate(() => SugarCube.State.getVar("$player.health"))).toBe(10);
});

test("lists locks from both stores and unlocks them directly from Locked Variables", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => SugarCube.State.setVar("$player", { health: 10 }));
  const drawer = await openVariables(page);
  await expandVariable(drawer, "player");
  await drawer.getByRole("button", { name: "Lock health", exact: true }).click();
  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await drawer.getByRole("button", { name: "Lock choice", exact: true }).click();

  const lockedTab = drawer.getByRole("tab", { name: "Locked Variables" });
  await expect(lockedTab).toBeVisible();
  await lockedTab.click();
  const list = drawer.getByRole("list", { name: "Locked variables" });
  const health = list.getByRole("listitem").filter({ hasText: "$player.health" });
  const choice = list.getByRole("listitem").filter({ hasText: "_choice" });
  await expect(health.getByTitle("10", { exact: true })).toBeVisible();
  await expect(choice.getByTitle('"north"', { exact: true })).toBeVisible();

  await health.getByRole("button", { name: "Unlock $player.health" }).press("Enter");
  await expect(health).toHaveCount(0);
  const unlockChoice = choice.getByRole("button", { name: "Unlock _choice" });
  await expect(unlockChoice).toBeFocused();
  await page.evaluate(() => {
    SugarCube.State.setVar("$player.health", 4);
    SugarCube.State.setVar("_choice", "south");
  });
  await expect.poll(() => page.evaluate(() => SugarCube.State.getVar("_choice"))).toBe("north");
  expect(await page.evaluate(() => SugarCube.State.getVar("$player.health"))).toBe(4);
  await unlockChoice.press("Enter");
  await expect(drawer.getByText("No locked variables.", { exact: true })).toBeVisible();
});

test("bulk actions clear saved favorites and release locks independently", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await drawer.getByRole("button", { name: "Add score to favorites" }).click();
  await drawer.getByRole("button", { name: "Lock score", exact: true }).click();
  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await drawer.getByRole("button", { name: "Add choice to favorites" }).click();
  await drawer.getByRole("button", { name: "Lock choice", exact: true }).click();

  await drawer.getByRole("tab", { name: "Favorites" }).click();
  const clearAll = drawer.getByRole("button", { name: "Clear All", exact: true });
  await expect(clearAll).toBeVisible();
  await clearAll.press("Enter");
  await expect(drawer.getByRole("region", { name: "Favorite variables", exact: true })).toBeFocused();
  await expect(drawer.getByText("Star a variable to watch it here.", { exact: true })).toBeVisible();
  await expect(clearAll).toBeDisabled();

  await drawer.getByRole("tab", { name: "Locked Variables" }).click();
  const list = drawer.getByRole("list", { name: "Locked variables" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const unlockAll = drawer.getByRole("button", { name: "Unlock All", exact: true });
  await unlockAll.press("Enter");
  await expect(drawer.getByRole("region", { name: "Locked variables", exact: true })).toBeFocused();
  await expect(drawer.getByText("No locked variables.", { exact: true })).toBeVisible();
  await expect(unlockAll).toBeDisabled();

  await page.evaluate(() => SugarCube.State.setVar("$score", 31));
  await drawer.getByRole("tab", { name: "Story Variables" }).click();
  await expect(drawer.getByTitle("31", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(31);

  await page.reload();
  await openVariables(page);
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  await expect(drawer.getByText("Star a variable to watch it here.", { exact: true })).toBeVisible();
  await expect(clearAll).toBeDisabled();
});

test("searches both variable scopes and reveals a result in a collapsed branch", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => {
    SugarCube.State.setVar("$settings", { needle: "nested result", oldNeedle: true, 'a"b': true });
    SugarCube.State.setVar("$unopened", { needle: "excluded result" });
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    for (let index = 0; index < 150; index++) vars[`padding${index}`] = index;
    vars.tailNeedle = "offscreen result";
    for (let index = 0; index < 25; index++) vars[`capName${index}`] = index;
    vars.capName = true;
  });
  const drawer = await openVariables(page);
  const settings = await expandVariable(drawer, "settings");
  await settings.locator(".ant-tree-switcher").click();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => {
    SugarCube.State.setVar("_needle", "temporary result");
    SugarCube.State.setVar("$settings.newNeedle", true);
    const settings = SugarCube.State.getVar("$settings") as Record<string, unknown>;
    delete settings.oldNeedle;
  });

  const search = drawer.getByRole("searchbox", { name: "Search variables" });
  await expect(search).toBeVisible();
  await search.fill("NEEDLE");
  await search.press("Enter");
  await expect(drawer.getByRole("button", { name: "$settings.newNeedle" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "$settings.oldNeedle" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "$unopened.needle" })).toHaveCount(0);
  await drawer.getByRole("button", { name: "_needle" }).click();
  await expect(drawer.getByRole("tab", { name: "Temporary Variables" })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByTitle('"temporary result"', { exact: true })).toBeVisible();

  await search.fill("needle");
  await search.press("Enter");
  await drawer.getByRole("button", { name: "$settings.needle" }).click();
  await expect(drawer.getByRole("tab", { name: "Story Variables" })).toHaveAttribute("aria-selected", "true");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByTitle('"nested result"', { exact: true })).toBeVisible();

  await expect(drawer.getByText("tailNeedle", { exact: true })).toHaveCount(0);
  await search.press("Enter");
  await drawer.getByRole("button", { name: "$tailNeedle" }).click();
  const tailRow = drawer.getByRole("treeitem", { name: /^tailNeedle/ });
  await expect(tailRow).toBeInViewport();
  const storyTree = drawer.getByRole("tree", { name: "Story variables tree" });
  const tailId = await tailRow.getAttribute("id");
  expect(tailId).toBeTruthy();
  await storyTree.focus();
  await expect(storyTree).toHaveAttribute("aria-activedescendant", tailId!);
  await storyTree.press("ArrowUp");
  await expect(storyTree).not.toHaveAttribute("aria-activedescendant", tailId!);

  await search.fill('a"b');
  await search.press("Enter");
  await expect(drawer.getByRole("button", { name: String.raw`$settings["a\"b"]` })).toBeVisible();

  await search.fill("capName");
  await search.press("Enter");
  const results = drawer.getByRole("list", { name: "Story variables" }).getByRole("button");
  await expect(results).toHaveCount(20);
  await expect(results.first()).toHaveAccessibleName("$capName");
});

test("saves hidden inspector settings with the story and restores them in another export", async ({ page }) => {
  const exportDir = await mkdtemp(join(tmpdir(), "inspector-export-"));
  const exportFile = join(exportDir, "rebuilt.html");
  try {
    await copyFile(fileURLToPath(storyUrl), exportFile);
    await page.goto(storyUrl);
    const drawer = await openVariables(page);
    await expandVariable(drawer, "inventory");
    await drawer.getByRole("button", { name: "Add 0 to favorites" }).click();
    const metadata = await page.evaluate(() => SugarCube.State.getVar("$__sugarcubeInspector"));
    expect(metadata).toEqual({ version: 1, favorites: [{ root: "variables", path: ["inventory", "0"] }] });
    await expect(drawer.getByText("__sugarcubeInspector", { exact: true })).toHaveCount(0);
    const search = drawer.getByRole("searchbox", { name: "Search variables" });
    await search.fill("sugarcubeInspector");
    await search.press("Enter");
    await expect(drawer.getByText("No matching variables.", { exact: true })).toBeVisible();
    await search.fill("$__sugarcubeInspector.favorites");
    await search.press("Enter");
    await expect(drawer.getByRole("alert")).toContainText("not available");
    const saved = await page.evaluate(() => SugarCube.Save.base64.save());

    await page.goto(pathToFileURL(exportFile).href);
    await openVariables(page);
    await page.evaluate((saved) => SugarCube.Save.base64.load(saved), saved);
    await openVariables(page);
    await drawer.getByRole("tab", { name: "Favorites" }).click();
    await expect(drawer.getByText("$inventory[0]", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Clear All", exact: true }).click();
    const emptySave = await page.evaluate(() => SugarCube.Save.base64.save());

    await page.reload();
    await openVariables(page);
    await page.evaluate((saved) => SugarCube.Save.base64.load(saved), emptySave);
    await openVariables(page);
    await drawer.getByRole("tab", { name: "Favorites" }).click();
    await expect(drawer.getByText("Star a variable to watch it here.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => {
      SugarCube.State.setVar("$__sugarcubeInspector", { version: 2, favorites: [] });
      return SugarCube.Save.base64.save();
    })).toEqual(expect.any(String));
  } finally {
    await unlink(exportFile);
    await rmdir(exportDir);
  }
});

test("migrates legacy extension favorites into the hidden story object", async ({ page, context }) => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const path = { root: "variables", path: ["score"] };
  const key = 'favorites:file::8a6e4307-c73b-4f1b-9322-7cf69b980fb1:' + JSON.stringify(path);
  await worker.evaluate(`chrome.storage.local.set(${JSON.stringify({ [key]: path })})`);
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  await expect(drawer.getByText("$score", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => SugarCube.State.getVar("$__sugarcubeInspector"))).toEqual({ version: 1, favorites: [path] });
  await drawer.getByRole("button", { name: "Clear All", exact: true }).click();
  expect(await worker.evaluate("chrome.storage.local.get(null)")).toEqual({ [key]: path });
});

test("favorites follow the story moment when moving through history", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await drawer.getByRole("button", { name: "Add score to favorites" }).click();
  await page.getByRole("link", { name: "Continue" }).click();
  await openVariables(page);
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  await drawer.getByRole("button", { name: "Clear All", exact: true }).click();
  await page.getByRole("link", { name: "Return" }).click();
  await page.evaluate(() => SugarCube.Engine.backward());
  await openVariables(page);
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  await expect(drawer.getByText("$score", { exact: true })).toBeVisible();
});

test("overview follows the current passage and playable history", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);
  const overview = drawer.getByRole("region", { name: "Story overview" });
  await expect(overview.getByText("Inspector Smoke Story", { exact: true })).toBeVisible();
  await expect(overview.getByLabel("Current passage")).toHaveText("Start");
  await expect(overview.getByLabel("Turn")).toHaveText("1");

  await page.getByRole("link", { name: "Continue" }).click();
  await openDrawer(page);
  await expect(overview.getByLabel("Current passage")).toHaveText("Next Passage");
  await expect(overview.getByLabel("Turn")).toHaveText("2");
  await expect(overview.getByRole("list", { name: "Recent passages" })).toHaveText("Start");

  await page.evaluate(() => SugarCube.Engine.backward());
  await expect(overview.getByLabel("Current passage")).toHaveText("Start");
  await expect(overview.getByLabel("Turn")).toHaveText("1");
  await expect(overview.getByRole("list", { name: "Recent passages" })).toHaveCount(0);
});

test("favorite history records passage context and changes to and from missing", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await drawer.getByRole("button", { name: "Add score to favorites" }).click();
  await drawer.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("link", { name: "Continue" }).click();
  await openVariables(page);
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  const historyButton = drawer.getByRole("button", { name: "Show change history for $score" });
  await expect(historyButton).toBeVisible();
  await historyButton.press("Enter");
  await expect(historyButton).toHaveAttribute("aria-expanded", "true");
  const history = drawer.getByRole("region", { name: "Favorite change history" });
  await expect(history).toContainText("Turn 2 · Next Passage");
  await expect(history).toContainText("7 → 12");

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    delete vars.score;
  });
  await expect(history).toContainText("12 → Missing");
  await page.evaluate(() => SugarCube.State.setVar("$score", 19));
  await expect(history).toContainText("Missing → 19");
  await history.getByRole("button", { name: "Close history" }).click();
  await expect(historyButton).toHaveAttribute("aria-expanded", "false");
  await expect(historyButton).toBeFocused();
});

test("finds exported passage source by title and tag without running it", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => {
    for (const passage of document.querySelectorAll("tw-passagedata")) {
      passage.prepend("İ".repeat(40));
      passage.append("\nAdditional source line".repeat(200));
    }
  });
  const drawer = await openDrawer(page);
  const openSource = drawer.getByRole("button", { name: "Open current passage source" });
  await expect(openSource).toBeVisible();
  await openSource.click();
  await expect(drawer.getByRole("tab", { name: "Passages" })).toHaveAttribute("aria-selected", "true");
  const browser = drawer.getByRole("region", { name: "Passage browser" });
  const source = browser.locator("pre");
  await expect(source).toContainText("<<set $score = 7>>");

  const picker = browser.getByRole("combobox", { name: "Find passage" });
  await expect(picker).toBeFocused();
  expect(await source.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  })).toBeGreaterThan(0);
  await picker.fill("Next Passage");
  await picker.press("Enter");
  await expect(source).toContainText("<<set $score = 12>>");
  await expect.poll(() => source.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(7);

  await picker.fill("intro");
  const options = drawer.locator(".ant-select-dropdown");
  await expect(options.getByText("Next Passage", { exact: true })).toHaveCount(0);
  await options.locator(".ant-select-item-option-content").getByText("Start", { exact: true }).click();
  await expect(source).toContainText("<<set $score = 7>>");

  await picker.fill("$score = 12");
  await expect(options.locator(".ant-select-item-option-content")).toContainText("$score = 12");
  await picker.press("Enter");
  await expect(source).toContainText("<<set $score = 12>>");
  expect(await page.evaluate(() => SugarCube.State.getVar("$score"))).toBe(7);
  await picker.fill("$score = 12");
  await picker.press("Enter");
  await expect(picker).toHaveValue("");
});

test("opens an exact path inside previously unopened branches", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => SugarCube.State.setVar("$Player", { stats: [{ "health points": 42 }] }));
  const drawer = await openVariables(page);
  const search = drawer.getByRole("searchbox", { name: "Search variables" });
  await search.fill('$Player.stats[0]["health points"]');
  await search.press("Enter");
  await expect(drawer.getByText("health points", { exact: true })).toBeVisible();
  await search.fill("$player.stats");
  await search.press("Enter");
  await expect(drawer.getByRole("alert")).toContainText("not available");
});

test("shows and copies a full primitive value and follows its live path", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(storyUrl);
  const value = "<b>plain text</b>\n" + "long value ".repeat(40);
  await page.evaluate((value) => SugarCube.State.setVar("$player", { note: value }), value);
  const drawer = await openVariables(page);
  await expandVariable(drawer, "player");
  const opener = drawer.getByRole("button", { name: "Show full value for note" });
  await opener.click();
  const details = drawer.getByRole("region", { name: "Variable details" });
  await expect(details.locator("pre")).toHaveText(value);
  await expect(details.locator("b")).toHaveCount(0);
  await details.getByRole("button", { name: "Copy Path" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("$player.note");
  await details.getByRole("button", { name: "Copy Value" }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(value);
  await page.evaluate(() => SugarCube.State.setVar("$player", { note: "replacement" }));
  await expect(details.locator("pre")).toHaveText("replacement");
  await details.getByRole("button", { name: "Close details" }).click();
  await expect(details).toHaveCount(0);
  // Replaced owners rebuild tree rows; closing still returns focus to the tree.
  await expect(drawer.getByRole("tree", { name: "Story variables tree" })).toBeFocused();
});

test("Tailwind utilities stay inside the inspector ShadowRoot", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  const result = await drawer.evaluate((host) => {
    const shadow = host.shadowRoot!;
    const layout = shadow.querySelector<HTMLElement>("[data-tailwind-layout]")!;
    const aside = shadow.querySelector<HTMLElement>("aside")!;
    const css = shadow.querySelector<HTMLStyleElement>("style[data-inspector-styles='tailwind']")?.textContent ?? "";
    return {
      display: getComputedStyle(layout).display,
      direction: getComputedStyle(layout).flexDirection,
      position: getComputedStyle(aside).position,
      generated: css.includes(".flex-col") && css.includes(".min-h-0"),
      leaked: [...document.querySelectorAll("style")].some(
        (style) => style.textContent?.includes(".min-h-0") && style.textContent?.includes(".flex-col"),
      ),
    };
  });
  expect(result).toEqual({ display: "flex", direction: "column", position: "fixed", generated: true, leaked: false });
});

test("Ant Design Tree View preserves scope navigation and variable inspection", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openDrawer(page);

  const overview = drawer.getByRole("tab", { name: "Overview" });
  const variables = drawer.getByRole("tab", { name: "Variables", exact: true });
  const passages = drawer.getByRole("tab", { name: "Passages" });
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
  await passages.click();
  await expect(passages).toHaveAttribute("aria-selected", "true");
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
  await drawer.getByRole("tab", { name: "Passages" }).click();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(tree).toHaveAttribute("data-persistent-tree", "yes");
  await expect(drawer.getByRole("treeitem", { name: /^inventory/ }))
    .toHaveAttribute("aria-expanded", "true");

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await drawer.getByRole("tab", { name: "Story Variables" }).click();
  await expect(tree).toHaveAttribute("data-persistent-tree", "yes");

  // The accessible tree role can belong to an internal Ant element.
  // Measure the Tree component's outer container, not its scrollable list.
  const remainingGap = async () => tree.evaluate((element) => {
    const outerTree = element.closest(".sugarcube-variable-tree");
    if (!outerTree) throw new Error("Outer Tree container not found");
    const treeBottom = outerTree.getBoundingClientRect().bottom;
    const drawerBottom = element.closest("aside")!.getBoundingClientRect().bottom;
    return Math.abs(drawerBottom - 16 - treeBottom);
  });
  await expect.poll(remainingGap).toBeLessThan(12);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(remainingGap).toBeLessThan(12);
});

test("offscreen expanded nodes update Ant virtual list without remounting", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto(storyUrl);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.offscreen = { first: 1 };
    for (let i = 0; i < 250; i++) vars[`spacer_${i}`] = i;
  });
  const drawer = await openVariables(page);
  const tree = drawer.getByRole("tree", { name: "Story variables tree" });
  const holder = tree.locator(".ant-tree-list-holder");
  const row = drawer.getByRole("treeitem", { name: /^offscreen/ });
  await expandVariable(drawer, "offscreen");
  await expect(drawer.getByText("first", { exact: true })).toBeVisible();

  await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(row).toHaveCount(0);
  const before = await holder.evaluate((element) => element.scrollHeight);

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, { first: number; added?: number }>;
    vars.offscreen!.added = 2;
  });
  // Logical list height increases while the expanded parent row is still absent.
  await expect.poll(() => holder.evaluate((element) => element.scrollHeight))
    .toBeGreaterThan(before);
  await expect(row).toHaveCount(0);

  await holder.evaluate((element) => { element.scrollTop = 0; });
  await expect(drawer.getByText("added", { exact: true })).toBeVisible();
});

test("offscreen expanded nodes follow object replacement", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto(storyUrl);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.offscreen = { child: { old: 1 } };
    for (let i = 0; i < 250; i++) vars[`spacer_${i}`] = i;
  });
  const drawer = await openVariables(page);
  const holder = drawer.getByRole("tree", { name: "Story variables tree" })
    .locator(".ant-tree-list-holder");
  await expandVariable(drawer, "offscreen");
  await expandVariable(drawer, "child");
  await expect(drawer.getByText("old", { exact: true })).toBeVisible();

  await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(drawer.getByRole("treeitem", { name: /^offscreen/ })).toHaveCount(0);
  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    vars.offscreen = { child: { replacement: 2 } };
  });
  await holder.evaluate((element) => { element.scrollTop = 0; });
  await expect(drawer.getByRole("treeitem", { name: /^offscreen/ }))
    .toHaveAttribute("aria-expanded", "true");
  // Wait for offscreen identity reconciliation before inspecting the new child.
  await expect(drawer.getByText("old", { exact: true })).toHaveCount(0);
  const child = drawer.getByRole("treeitem", { name: /^child/ });
  // Reconciliation may preserve its expanded state; do not toggle it closed.
  if (await child.getAttribute("aria-expanded") !== "true") {
    await child.locator(".ant-tree-switcher").click();
  }
  await expect(child).toHaveAttribute("aria-expanded", "true");
  await expect(drawer.getByText("replacement", { exact: true })).toBeVisible();
  await expect(drawer.getByText("old", { exact: true })).toHaveCount(0);
});

test("custom drawer retains keyboard resizing and toggle behaviour", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await expect(handle).toHaveAttribute("aria-expanded", "true");

  const aside = drawer.locator("aside");
  const readWidth = () => aside.evaluate((element) => element.getBoundingClientRect().width);
  const width = await readWidth();
  await handle.press("ArrowLeft");
  await expect.poll(readWidth).toBeCloseTo(width + 24, 1);
  await handle.press("ArrowRight");
  await expect.poll(readWidth).toBeCloseTo(width, 1);

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

  const expand = inventory.getByRole("button", { name: /^inventory/ });
  const star = inventory.getByRole("button", { name: /^(Add inventory to|Remove inventory from) favorites$/ });
  await expect(expand).not.toHaveAccessibleName(/favorites/);
  await expect(expand.getByRole("button")).toHaveCount(0);
  await star.press("Enter");
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await expand.press("Enter");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
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

test("polling detects updated values after passage navigation without manual refresh", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await expect(drawer.getByRole("button", { name: "Refresh variables" })).toHaveCount(0);
  await page.locator("#passages").getByRole("link", { name: "Continue" }).click();
  await expect(page.locator("#passages")).toContainText("Passage changed.");
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

test("root structure watcher updates selected scopes and catches up after hidden tabs", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);

  await page.evaluate(() => {
    const story = SugarCube.State.variables as unknown as Record<string, unknown>;
    story.activeRootEntry = 1;
  });
  await expect(drawer.getByRole("treeitem", { name: /^activeRootEntry/ })).toBeVisible();

  await drawer.getByRole("tab", { name: "Temporary Variables" }).click();
  await page.evaluate(() => {
    const story = SugarCube.State.variables as unknown as Record<string, unknown>;
    delete story.activeRootEntry;
    story.hiddenRootEntry = { health: 7 };
    const temporary = SugarCube.State.temporary as unknown as Record<string, unknown>;
    temporary.temporaryRootEntry = 2;
  });
  await expect(drawer.getByRole("treeitem", { name: /^temporaryRootEntry/ })).toBeVisible();

  await drawer.getByRole("tab", { name: "Overview" }).click();
  await page.evaluate(() => {
    const temporary = SugarCube.State.temporary as unknown as Record<string, unknown>;
    delete temporary.temporaryRootEntry;
  });
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(drawer.getByRole("treeitem", { name: /^temporaryRootEntry/ })).toHaveCount(0);

  await drawer.getByRole("tab", { name: "Story Variables" }).click();
  await expect(drawer.getByRole("treeitem", { name: /^activeRootEntry/ })).toHaveCount(0);
  await expect(drawer.getByRole("treeitem", { name: /^hiddenRootEntry/ })).toBeVisible();
  await expandVariable(drawer, "hiddenRootEntry");
  await expect(drawer.getByText("health", { exact: true })).toBeVisible();
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
  await expect(drawer.getByRole("treeitem", { name: /^added/ })
    .getByTitle("17", { exact: true })).toBeVisible();
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
  const score = drawer.getByRole("treeitem", { name: /^score/ });
  await expect(score.locator(".token.keyword")).toHaveText("number");
  await expect(score.locator(".token.number")).toHaveText("7");

  const [typeColor, valueColor] = await score.locator(".token").evaluateAll(
    (nodes) => nodes.map((node) => getComputedStyle(node).color),
  );
  expect(typeColor).not.toBe(valueColor);

  const inventory = drawer.getByRole("treeitem", { name: /^inventory/ });
  await expect(inventory.locator(".token.class-name")).toHaveText("Array");
  const inventoryPreview = inventory.locator('[title="Array(2)"]');
  await expect(inventoryPreview).toHaveText("(2)");
  await expect(inventoryPreview.locator(".token.punctuation")).toHaveText(["(", ")"]);
  await expect(inventoryPreview.locator(".token.number")).toHaveText("2");
});

test("favourites stay live across tabs, object replacement, and missing paths", async ({ page }) => {
  await page.goto(storyUrl);
  const drawer = await openVariables(page);
  await page.evaluate(() => {
    const variables = SugarCube.State.variables as unknown as Record<string, unknown>;
    variables.pinnedPlayer = { health: 10 };
  });
  await expandVariable(drawer, "pinnedPlayer");
  const storyTree = drawer.getByRole("tree", { name: "Story variables tree" });
  await storyTree.getByRole("treeitem", { name: /^health/ })
    .getByRole("button", { name: "Add health to favorites" }).click();

  await drawer.getByRole("tab", { name: "Favorites" }).click();
  const favorites = drawer.getByRole("tree", { name: "Favorite variables tree" });
  const pinned = favorites.getByRole("treeitem", { name: /^\$pinnedPlayer\.health/ });
  await expect(pinned.getByTitle("10", { exact: true })).toBeVisible();

  await drawer.getByRole("tab", { name: "Overview" }).click();
  await page.evaluate(() => {
    const variables = SugarCube.State.variables as unknown as Record<string, unknown>;
    variables.pinnedPlayer = { health: 42 };
  });
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await drawer.getByRole("tab", { name: "Favorites" }).click();
  await expect(pinned.getByTitle("42", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const variables = SugarCube.State.variables as unknown as Record<string, unknown>;
    variables.pinnedPlayer = {};
  });
  await expect(pinned.getByTitle("[Missing]", { exact: true })).toBeVisible();

  await pinned.getByRole("button", { name: "Remove $pinnedPlayer.health from favorites" }).click();
  await expect(favorites.getByRole("treeitem")).toHaveCount(0);
});
