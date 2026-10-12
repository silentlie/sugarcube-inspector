import { expect, storyUrl, test } from "./fixtures";

type Metrics = {
  total: number;
  dom: number;
  firstFrame: number;
  secondFrame: number;
  clickHandler: number;
  onToggle: number | null;
  reactCommit: number | null;
  totals: Record<string, number>;
  counts: Record<string, number>;
};

test("temporary end-to-end expansion breakdown", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  await expect(drawer).toHaveCount(1);
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();

  for (const [fixture, variant] of [
    ["simple", "baseline"],
    ["simpleBackground", "baseline"],
    ["simpleBackground", "noRefresh"],
    ["simpleBackground", "plainSyntax"],
    ["simpleBackground", "both"],
    ["flat200", "baseline"],
    ["flat200", "noRefresh"],
    ["flat200", "plainSyntax"],
    ["flat200", "both"],
    ["nested", "baseline"],
    ["nested", "noRefresh"],
  ] as const) {
    const name = `bench_${fixture}_${variant}`;
    await page.evaluate(({ name, fixture }) => {
      function nested(depth: number): object {
        if (depth === 0) return { leaf: 1 };
        return Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`branch${i}`, nested(depth - 1)]));
      }
      const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
      vars[name] = fixture === "flat200"
        ? Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`value${i}`, i]))
        : fixture === "nested" ? nested(4) : { alpha: 1, beta: 2, gamma: 3 };
      if (fixture === "simpleBackground") vars[`${name}_background`] = nested(4);
    }, { name, fixture });

    const treeitem = drawer.getByRole("treeitem", { name: new RegExp(`^${name}(?:\\s|$)`) });
    await expect(treeitem).toBeVisible();
    const icon = treeitem.locator(".MuiTreeItem-iconContainer");
    const measurements: Metrics[] = [];
    const childText = fixture === "flat200" ? "value0"
      : fixture === "nested" ? "branch0" : "alpha";

    for (let run = 0; run < 5; run++) {
      if (run > 0) {
        await icon.click();
        await expect(treeitem).toHaveAttribute("aria-expanded", "false");
      }
      const result = await icon.evaluate((el, args): Promise<Metrics> => {
        return new Promise((resolve, reject) => {
          const shadow = el.getRootNode() as ShadowRoot;
          const variant = args.variant;
          const name = args.name;
          const itemId = (el.closest('[role="treeitem"]') as HTMLElement).id;
          const bench = {
            totals: {} as Record<string, number>,
            counts: {} as Record<string, number>,
            stamps: {} as Record<string, number>,
            skipRefresh: variant === "noRefresh" || variant === "both",
            plainSyntax: variant === "plainSyntax" || variant === "both",
          };
          const win = window as typeof window & { __scBench?: typeof bench };
          const t0 = performance.now();
          win.__scBench = bench;
          let done = false;
          let timeout = 0;
          const isPresent = () => {
            const row = shadow.querySelector(`[id="${itemId}"]`);
            return row?.getAttribute("aria-expanded") === "true" && Array.from(
              shadow.querySelectorAll('[role="treeitem"]'),
            ).some((node) => node.textContent?.includes(name) === false &&
              node.textContent?.includes(args.childText));
          };
          const observer = new MutationObserver(() => {
            if (!done && isPresent()) capture();
          });
          function capture() {
            if (done) return;
            done = true;
            observer.disconnect();
            clearTimeout(timeout);
            const dom = performance.now() - t0;
            requestAnimationFrame(() => {
              const firstFrame = performance.now() - t0;
              requestAnimationFrame(() => {
                const secondFrame = performance.now() - t0;
                const readout = {
                  total: secondFrame,
                  dom, firstFrame, secondFrame,
                  clickHandler,
                  onToggle: bench.stamps.onExpansionToggle === undefined
                    ? null : bench.stamps.onExpansionToggle - t0,
                  reactCommit: bench.stamps.reactCommit === undefined
                    ? null : bench.stamps.reactCommit - t0,
                  totals: { ...bench.totals },
                  counts: { ...bench.counts },
                };
                delete win.__scBench;
                resolve(readout);
              });
            });
          }
          const started = performance.now();
          (el as HTMLElement).click();
          const clickHandler = performance.now() - started;
          observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
          timeout = window.setTimeout(() => {
            observer.disconnect(); delete win.__scBench;
            reject(new Error("Could not observe expanded child within 6s"));
          }, 6000);
          if (isPresent()) capture();
        });
      }, { variant, name, childText });
      measurements.push(result);
      await expect(treeitem).toHaveAttribute("aria-expanded", "true");
    }
    console.log("DEEP_BENCH " + JSON.stringify({ fixture, variant, measurements }));
    await page.evaluate((name) => {
      const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
      delete vars[name];
      delete vars[`${name}_background`];
    }, name);
    await expect(treeitem).toHaveCount(0);
  }
});
