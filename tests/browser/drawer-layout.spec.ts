import type {} from "twine-sugarcube";
import type { Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openInspector(page: Page) {
  const host = page.locator("sugarcube-inspector");
  await expect(host).toHaveCount(1);
  const resizeHandle = host.getByRole("button", { name: "Resize SugarCube Inspector" });
  await resizeHandle.press("Enter");
  await expect(resizeHandle).toHaveAttribute("aria-expanded", "true");
  return { host, resizeHandle };
}

test("maximum drawer width reserves space for the stationary edge tab", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(storyUrl);
  const { host, resizeHandle } = await openInspector(page);
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();

  // Resize to the viewport minus the 32px tab through real keyboard interaction.
  for (let i = 0; i < 20; i++) await resizeHandle.press("ArrowLeft");
  const aside = host.locator("aside");
  await expect(aside).toHaveCSS("width", "768px");

  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  await expect(closeTab).toBeVisible();
  const bounds = await closeTab.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(800);
  const handleBounds = await resizeHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  // Adjacent hit areas: the tab must not cover any of the 8px resize handle.
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(handleBounds!.x + 0.5);

  await closeTab.click();
  const openTab = host.getByRole("button", { name: "Open SugarCube Inspector" });
  await expect(openTab).toBeVisible();
  await openTab.click();
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");

  // A later viewport resize must also reserve tab clearance, without a new drag.
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(aside).toHaveCSS("width", "608px");
  const resizedTab = await closeTab.boundingBox();
  const resizedHandle = await resizeHandle.boundingBox();
  expect(resizedTab).not.toBeNull();
  expect(resizedHandle).not.toBeNull();
  expect(resizedTab!.x + resizedTab!.width).toBeLessThanOrEqual(resizedHandle!.x + 0.5);
});

test("dragging the toggle tab repositions it without closing the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(storyUrl);
  const { host } = await openInspector(page);
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();

  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  const initial = await closeTab.boundingBox();
  expect(initial).not.toBeNull();

  const x = initial!.x + initial!.width / 2;
  const y = initial!.y + initial!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.up();

  // Releasing a drag must not also trigger the button's click action.
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");
  const dragged = await closeTab.boundingBox();
  expect(dragged).not.toBeNull();
  expect(dragged!.y).toBeGreaterThan(initial!.y + 100);

  await page.mouse.move(100, 500);
  await page.waitForTimeout(500);
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");

  await closeTab.click();
  const openTab = host.getByRole("button", { name: "Open SugarCube Inspector" });
  await expect(openTab).toBeVisible();
  expect((await openTab.boundingBox())!.y).toBeCloseTo(dragged!.y, 0);

  await openTab.click();
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");

  // Keyboard positioning uses the same vertically constrained tab.
  await closeTab.press("ArrowDown");
  const down = await closeTab.boundingBox();
  expect(down!.y).toBeCloseTo(dragged!.y + 24, 0);
  await closeTab.press("ArrowUp");
  expect((await closeTab.boundingBox())!.y).toBeCloseTo(dragged!.y, 0);

  // Mode changes also retain the tab position.
  await host.getByRole("button", { name: "Switch to hover mode" }).click();
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();
  expect((await closeTab.boundingBox())!.y).toBeCloseTo(dragged!.y, 0);

  // Real pointer capture must constrain the drag within the viewport.
  const beforeClamp = await closeTab.boundingBox();
  await page.mouse.move(beforeClamp!.x + beforeClamp!.width / 2, beforeClamp!.y + 20);
  await page.mouse.down();
  await page.mouse.move(beforeClamp!.x + beforeClamp!.width / 2, 1000, { steps: 6 });
  await page.mouse.up();
  const clamped = await closeTab.boundingBox();
  expect(clamped!.y).toBeGreaterThanOrEqual(0);
  expect(clamped!.y + clamped!.height).toBeLessThanOrEqual(700);
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");
});

test("CSS intrinsic minimum responds to content changes without resizing", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto(storyUrl);
  const { host } = await openInspector(page);
  const aside = host.locator("aside");

  // Inject a fixed-width child so the intrinsic minimum is deterministic.
  await aside.evaluate((element) => {
    const probe = document.createElement("div");
    probe.dataset.intrinsicWidthProbe = "yes";
    probe.style.width = "600px";
    probe.style.height = "1px";
    element.append(probe);
  });
  await expect(aside).toHaveCSS("min-width", "min-content");
  await expect(aside).toHaveCSS("width", "600px");

  // Reflow must happen without any pointer or keyboard resize event.
  await aside.locator("[data-intrinsic-width-probe]").evaluate((probe) => {
    (probe as HTMLElement).style.width = "720px";
  });
  await expect(aside).toHaveCSS("width", "720px");

  await aside.locator("[data-intrinsic-width-probe]").evaluate((probe) => {
    (probe as HTMLElement).style.width = "600px";
  });
  await expect(aside).toHaveCSS("width", "600px");

  // Intentional trade-off: min-content takes precedence over max-width on small screens.
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(aside).toHaveCSS("width", "600px");

  // Even with an oversized drawer, the click-mode tab stays on screen.
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();
  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  const bounds = await closeTab.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await closeTab.click();
  await expect(host.getByRole("button", { name: "Open SugarCube Inspector" })).toBeVisible();
});

test("virtualized nested tree preserves leaf elbows and centers branch chevrons", async ({ page }) => {
  await page.goto(storyUrl);
  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.connectorFixture = { branch: { leaf: 42 }, sibling: 1 };
  });
  const { host } = await openInspector(page);
  await host.getByRole("tab", { name: "Variables", exact: true }).click();
  const root = host.getByRole("treeitem", { name: /^connectorFixture/ });
  await expect(root).toBeVisible();
  await root.locator(".ant-tree-switcher").click();

  const branch = host.getByRole("treeitem", { name: /^branch/ });
  await expect(branch).toBeVisible();
  await branch.locator(".ant-tree-switcher").click();

  const leaf = host.getByRole("treeitem", { name: /^leaf/ });
  const sibling = host.getByRole("treeitem", { name: /^sibling/ });
  await expect(leaf).toBeVisible();
  await expect(sibling).toBeVisible();

  for (const row of [sibling, leaf]) {
    const leafLine = row.locator(".ant-tree-switcher-leaf-line");
    await expect(leafLine).toHaveCount(1);
    const strokes = await leafLine.evaluate((line) => ({
      vertical: Number.parseFloat(getComputedStyle(line, "::before").borderInlineEndWidth),
      horizontal: Number.parseFloat(getComputedStyle(line, "::after").borderBottomWidth),
    }));
    expect(strokes.vertical).toBeGreaterThan(0);
    expect(strokes.horizontal).toBeGreaterThan(0);
  }
  expect(await leaf.locator(".ant-tree-indent-unit").count()).toBeGreaterThanOrEqual(2);

  const chevronAlignment = await branch.evaluate((element) => {
    const icon = element.querySelector<SVGElement>(".ant-tree-switcher svg");
    const title = element.querySelector<HTMLElement>(".ant-tree-node-content-wrapper");
    if (!icon || !title) throw new Error("Missing chevron or title in branch row");
    const iconRect = icon.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return Math.abs((iconRect.top + iconRect.bottom) / 2 -
      (titleRect.top + titleRect.bottom) / 2);
  });
  expect(chevronAlignment).toBeLessThanOrEqual(2);
});
