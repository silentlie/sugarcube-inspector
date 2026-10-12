import { expect, storyUrl, test } from "./fixtures";

type Sample = {
  clickMs: number;
  domMs: number;
  firstFrameMs: number;
  secondFrameMs: number;
  commits: { atMs: number; duration: number; phase: string }[];
  counts: Record<string, number>;
  mountedRows: number;
};

test("temporary variable row rendering breakdown", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  await expect(drawer).toHaveCount(1);
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();

  await page.evaluate(() => {
    const store = SugarCube.State.variables as unknown as Record<string, unknown>;
    store.renderFixtures = Object.fromEntries(
      [20, 200, 500, 1000].flatMap((size) => Array.from({ length: 3 }, (_, trial) => [
        `width${size}Trial${trial}`,
        Object.fromEntries(Array.from({ length: size }, (_, i) => [
          `item${String(i).padStart(4, "0")}`, i,
        ])),
      ])),
    );
  });

  for (const variant of [
    "baseline", "plainSyntax", "noObserver", "minimalRow", "capped25",
  ] as const) {
    await page.evaluate((variant) => {
      (window as typeof window & { __scRowBench?: {
        variant: string;
        counts: Record<string, number>;
        commits: unknown[];
      } }).__scRowBench = { variant, counts: {}, commits: [] };
    }, variant);
    await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
    const story = drawer.getByRole("tab", { name: "Story Variables" });
    await story.click();
    const parent = drawer.getByRole("treeitem", { name: /^renderFixtures(?:\s|$)/ });
    await expect(parent).toBeVisible();
    await parent.locator(".MuiTreeItem-iconContainer").first().click();
    await expect(parent).toHaveAttribute("aria-expanded", "true");

    for (const size of [20, 200, 500, 1000]) {
      const samples: Sample[] = [];
      for (let repeat = 0; repeat < 3; repeat++) {
        const row = drawer.getByRole("treeitem", {
          name: new RegExp(`^width${size}Trial${repeat}(?:\\\\s|$)`),
        });
        await expect(row).toBeVisible();
        const icon = row.locator(".MuiTreeItem-iconContainer").first();
        const measurement = await icon.evaluate((el): Promise<Sample> => new Promise((resolve, reject) => {
          const win = window as typeof window & { __scRowBench?: {
            counts: Record<string, number>;
            commits: { at: number; duration: number; phase: string }[];
          } };
          const state = win.__scRowBench!;
          state.counts = {};
          state.commits = [];
          const shadow = el.getRootNode() as ShadowRoot;
          const parent = el.closest('[role="treeitem"]')!;
          const start = performance.now();
          let finished = false;
          let clickMs = 0;
          const hasChild = () => parent.getAttribute("aria-expanded") === "true" &&
            Array.from(parent.querySelectorAll('[role="treeitem"]'))
              .some((node) => node.querySelector(".MuiTreeItem-label")?.textContent?.startsWith("item0000"));
          const observer = new MutationObserver(() => {
            if (hasChild()) finish();
          });
          const timeout = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error("Expansion child did not appear within 8 seconds"));
          }, 8000);
          function finish() {
            if (finished) return;
            finished = true;
            observer.disconnect();
            window.clearTimeout(timeout);
            const domMs = performance.now() - start;
            const mountedRows = shadow.querySelectorAll('[role="treeitem"]').length;
            requestAnimationFrame(() => {
              const firstFrameMs = performance.now() - start;
              requestAnimationFrame(() => {
                resolve({
                  clickMs, domMs, firstFrameMs,
                  secondFrameMs: performance.now() - start,
                  commits: state.commits.map((c) => ({
                    atMs: c.at - start, duration: c.duration, phase: c.phase,
                  })),
                  counts: { ...state.counts }, mountedRows,
                });
              });
            });
          }
          observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
          const beforeClick = performance.now();
          (el as HTMLElement).click();
          clickMs = performance.now() - beforeClick;
          if (hasChild()) finish();
        }));
        samples.push(measurement);
        await icon.click();
        await expect(row).toHaveAttribute("aria-expanded", "false");
        await page.waitForTimeout(250);
      }
      console.log("ROW_BENCH " + JSON.stringify({ variant, size, samples }));
    }
    await drawer.getByRole("tab", { name: "Overview" }).click();
  }

  await page.evaluate(() => {
    delete (SugarCube.State.variables as unknown as Record<string, unknown>).renderFixtures;
    delete (window as typeof window & { __scRowBench?: unknown }).__scRowBench;
  });
});
