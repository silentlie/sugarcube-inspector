import type {} from "twine-sugarcube";
import type { Locator, Page } from "@playwright/test";
import { expect, storyUrl, test } from "./fixtures";

async function openInspector(page: Page) {
  const host = page.locator("sugarcube-inspector");
  await expect(host).toHaveCount(1);
  const resizeHandle = host.getByRole("button", { name: "Resize SugarCube Inspector" });
  await resizeHandle.press("Enter");
  await expect(resizeHandle).toHaveAttribute("aria-expanded", "true");
  return { host, resizeHandle };
}

/** Ensure geometry checks run after the drawer's transform transition ends. */
async function expectOpenDrawerSettled(aside: Locator) {
  await expect.poll(async () => aside.evaluate((element) =>
    Math.abs(element.getBoundingClientRect().right - window.innerWidth),
  )).toBeLessThanOrEqual(0.5);
}

/** Read both rectangles in the same frame; sequential boundingBox() calls can span animations. */
async function tabOverlapWithResizeHandle(tab: Locator): Promise<number> {
  return tab.evaluate((element) => {
    const handle = element.closest("aside")?.querySelector<HTMLElement>(
      '[aria-label="Resize SugarCube Inspector"]',
    );
    if (!handle) throw new Error("Missing drawer resize handle");
    return element.getBoundingClientRect().right - handle.getBoundingClientRect().left;
  });
}

test("hover mode can use the entire viewport width", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(storyUrl);
  const { host, resizeHandle } = await openInspector(page);
  const aside = host.locator("aside");

  for (let i = 0; i < 20; i++) await resizeHandle.press("ArrowLeft");
  await expect(aside).toHaveCSS("width", "800px");

  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();
  await expect(aside).toHaveCSS("width", "768px");
  await host.getByRole("button", { name: "Switch to hover mode" }).click();
  await expect(aside).toHaveCSS("width", "800px");
});

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
  // Adjacent hit areas: the tab must not cover any of the 8px resize handle.
  expect(await tabOverlapWithResizeHandle(closeTab)).toBeLessThanOrEqual(0.5);

  await closeTab.click();
  const openTab = host.getByRole("button", { name: "Open SugarCube Inspector" });
  await expect(openTab).toBeVisible();
  await openTab.click();
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");

  // A later viewport resize must also reserve tab clearance, without a new drag.
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(aside).toHaveCSS("width", "608px");
  await expectOpenDrawerSettled(aside);
  expect(await tabOverlapWithResizeHandle(closeTab)).toBeLessThanOrEqual(0.5);
  const resizedTab = await closeTab.boundingBox();
  expect(resizedTab).not.toBeNull();
  expect(resizedTab!.x).toBeGreaterThanOrEqual(0);
  expect(resizedTab!.x + resizedTab!.width).toBeLessThanOrEqual(640);
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

test("closed drawer controls are inert but the edge tab stays keyboard-accessible", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(storyUrl);
  const { host, resizeHandle } = await openInspector(page);
  const content = host.locator("aside > div");

  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();
  const modeButton = host.locator('button[aria-label="Switch to hover mode"]');
  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  await expect(content).not.toHaveAttribute("inert");
  await closeTab.click();

  const openTab = host.getByRole("button", { name: "Open SugarCube Inspector" });
  await expect(content).toHaveAttribute("inert", "");
  await expect(modeButton).toHaveAttribute("inert", "");
  await expect(resizeHandle).toHaveAttribute("inert", "");
  await expect(openTab).not.toHaveAttribute("inert");

  // Keyboard Tab must not enter the visually hidden controls.
  await openTab.focus();
  await page.keyboard.press("Tab");
  const focusedLabel = await host.evaluate((element) =>
    element.shadowRoot?.activeElement?.getAttribute("aria-label") ?? null,
  );
  expect(focusedLabel).not.toBe("Switch to hover mode");
  expect(focusedLabel).not.toBe("Resize SugarCube Inspector");

  // The tab can reopen the drawer through the keyboard.
  await openTab.focus();
  await openTab.press("Space");
  await expect(closeTab).toHaveAttribute("aria-expanded", "true");
  await expect(content).not.toHaveAttribute("inert");
  await expect(modeButton).not.toHaveAttribute("inert");
  await expect(resizeHandle).not.toHaveAttribute("inert");

  // Hover mode keeps its handle accessible while the rest is closed.
  await host.getByRole("button", { name: "Switch to hover mode" }).click();
  await resizeHandle.press("Enter");
  await expect(content).toHaveAttribute("inert", "");
  await expect(resizeHandle).not.toHaveAttribute("inert");
  await resizeHandle.press("Enter");
  await expect(content).not.toHaveAttribute("inert");
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

  // Select click mode before narrowing the viewport, so the resize test only
  // measures intrinsic reflow and tab placement rather than hidden controls.
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();

  // Intentional trade-off: min-content takes precedence over max-width on small screens.
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(aside).toHaveCSS("width", "600px");
  await expectOpenDrawerSettled(aside);

  // Even with an oversized drawer, the click-mode tab stays on screen.
  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  const bounds = await closeTab.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  // Content-driven overflow may cover the onscreen tab visually, an accepted
  // limitation. The tab remains keyboard-operable even in that configuration.
  await closeTab.focus();
  await closeTab.press("Space");
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
