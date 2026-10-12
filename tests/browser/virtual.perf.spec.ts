import { expect, storyUrl, test } from "./fixtures";

type Measure = { dom: number; frame1: number; frame2: number; mounted: number };

test("temporary virtualized expansion performance, wide and nested", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).hover();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    for (const width of [200, 1000, 5000, 10000]) {
      for (let n = 0; n < 3; n++) {
        vars[`benchWide${width}Trial${n}`] = Object.fromEntries(
          Array.from({ length: width }, (_, i) => [
            `item${String(i).padStart(5, "0")}`, i,
          ]),
        );
      }
    }
    for (let trial = 0; trial < 3; trial++) {
      const nodes: object[] = [{}];
      for (let i = 1; i < 10000; i++) {
        const parent = nodes[Math.floor((i - 1) / 20)]!;
        const child: object = i % 4 === 0 ? {} : i % 4 === 1 ? []
          : i % 4 === 2 ? new Map() : new Set();
        if (Array.isArray(parent)) parent.push(child);
        else if (parent instanceof Map) parent.set(`child${i}`, child);
        else if (parent instanceof Set) parent.add(child);
        else (parent as Record<string, unknown>)[`child${i}`] = child;
        nodes.push(child);
      }
      vars[`benchNested10000Trial${trial}`] = nodes[0];
    }
  });
  await drawer.getByRole("button", { name: "Refresh variables" }).click();
  const holder = drawer.locator(".ant-tree-list-holder").first();

  for (const fixture of [
    "benchWide200", "benchWide1000", "benchWide5000", "benchWide10000",
    "benchNested10000",
  ]) {
    const samples: Measure[] = [];
    for (let n = 0; n < 3; n++) {
      await holder.evaluate((el) => { el.scrollTop = 0; });
      const row = drawer.getByRole("treeitem", { name: new RegExp(`^${fixture}Trial${n}`) });
      await expect(row).toBeVisible();
      const icon = row.locator(".ant-tree-switcher").first();
      await icon.evaluate((el) => {
        const host = el.getRootNode() as ShadowRoot;
        const parentId = el.closest('[role="treeitem"]')!.id;
        const state = {start:0, dom:0, frame1:0, frame2:0, mounted:0, done:false, error:""};
        const win = window as typeof window & { __scVirtualMetric?: typeof state };
        win.__scVirtualMetric = state;
        const hasChild = () => {
          const parent = host.getElementById(parentId);
          if (parent?.getAttribute("aria-expanded") !== "true") return false;
          return Array.from(host.querySelectorAll('[role="treeitem"]')).some((node) =>
            node !== parent && (node.textContent?.includes("item00000") ||
              node.textContent?.includes("child")));
        };
        const observer = new MutationObserver(() => {
          if (state.start > 0 && hasChild()) finish();
        });
        const timer = window.setTimeout(() => {
          observer.disconnect();
          state.error = "Never rendered child; expanded=" +
            host.getElementById(parentId)?.getAttribute("aria-expanded") +
            "; rows=" + Array.from(host.querySelectorAll('[role="treeitem"]'))
              .slice(0, 10).map((node) => node.textContent?.slice(0, 40)).join(",");
          state.done = true;
        }, 12000);
        function finish() {
          observer.disconnect();
          clearTimeout(timer);
          state.dom = performance.now() - state.start;
          state.mounted = host.querySelectorAll('[role="treeitem"]').length;
          requestAnimationFrame(() => {
            state.frame1 = performance.now() - state.start;
            requestAnimationFrame(() => {
              state.frame2 = performance.now() - state.start;
              state.done = true;
            });
          });
        }
        el.addEventListener("click", () => { state.start = performance.now(); },
          {capture:true, once:true});
        observer.observe(host, {childList:true, subtree:true, attributes:true});
      });
      await icon.click();
      await page.waitForFunction(() =>
        (window as typeof window & {__scVirtualMetric?: {done:boolean}}).__scVirtualMetric?.done,
      null, {timeout: 15000});
      const metric = await page.evaluate(() => {
        const win = window as typeof window & { __scVirtualMetric?: Measure & {done:boolean;error:string;start:number} };
        const state = win.__scVirtualMetric!;
        delete win.__scVirtualMetric;
        if (state.error) throw new Error(state.error);
        return {dom:state.dom,frame1:state.frame1,frame2:state.frame2,mounted:state.mounted};
      });
      samples.push(metric);
      await icon.click();
      await expect(row).toHaveAttribute("aria-expanded", "false");
    }
    console.log("ANT_BENCH:"+JSON.stringify({ fixture, samples }));
  }

  await page.evaluate(() => {
    const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
    for (const key of Object.keys(vars)) {
      if (key.startsWith("benchWide") || key.startsWith("benchNested")) delete vars[key];
    }
  });
});
