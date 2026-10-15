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

test("full-width drawer keeps its click-mode edge tab within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(storyUrl);
  const { host, resizeHandle } = await openInspector(page);
  await host.getByRole("button", { name: "Switch to click-to-toggle mode" }).click();

  // Resize to the exact viewport width through the real keyboard interaction.
  for (let i = 0; i < 20; i++) await resizeHandle.press("ArrowLeft");
  const aside = host.locator("aside");
  await expect(aside).toHaveCSS("width", "800px");

  const closeTab = host.getByRole("button", { name: "Close SugarCube Inspector" });
  await expect(closeTab).toBeVisible();
  const bounds = await closeTab.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(800);

  await closeTab.click();
  const openTab = host.getByRole("button", { name: "Open SugarCube Inspector" });
  await expect(openTab).toBeVisible();
  await openTab.click();
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
