import type {} from "twine-sugarcube";
import { expect, storyUrl, test } from "./fixtures";

test("temporary expansion benchmark", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  await expect(drawer).toHaveCount(1);
  const handle = drawer.getByRole("button", { name: "Resize SugarCube Inspector" });
  await handle.press("Enter");
  await handle.hover();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();

  const cases = ["simple3", "flat200", "nested4"] as const;
  for (const kind of cases) {
    const results: { clickMs: number; toDomMs: number; ownKeys: number; visited: number; descriptors: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const name = `perf_${kind}_${i}`;
      const childName = `${name}_child0`;
      await page.evaluate(({ kind, name }) => {
        const tracked = new WeakSet<object>();
        const nested = (depth: number): object => {
          const data: Record<string, unknown> = {};
          tracked.add(data);
          for (let k = 0; k < 4; k++) {
            data[`${name}_child${depth}_${k}`] = depth ? nested(depth - 1) : k;
          }
          return data;
        };
        const data: Record<string, unknown> = kind === "nested4"
          ? nested(4) as Record<string, unknown>
          : {};
        if (kind !== "nested4") {
          tracked.add(data);
          const count = kind === "simple3" ? 3 : 200;
          for (let k = 0; k < count; k++) data[`${name}_child${k}`] = k;
        }
        (window as typeof window & { __inspectorPerfTracked?: WeakSet<object> })
          .__inspectorPerfTracked = tracked;
        (SugarCube.State.variables as unknown as Record<string, unknown>)[name] = data;
      }, { kind, name });
      const item = drawer.getByRole("treeitem", { name: new RegExp(`^${name}(?:\\s|$)`) });
      await expect(item).toBeVisible();
      const result = await item.locator(".MuiTreeItem-iconContainer").evaluate(
        (icon, expectedName) => new Promise<{ clickMs: number; toDomMs: number; ownKeys: number; visited: number; descriptors: number }>((resolve, reject) => {
          const shadow = icon.getRootNode() as ShadowRoot;
          const tracked = (window as typeof window & { __inspectorPerfTracked?: WeakSet<object> }).__inspectorPerfTracked!;
          let ownKeys = 0;
          let descriptors = 0;
          const visited = new Set<object>();
          const originalOwnKeys = Reflect.ownKeys;
          const originalDescriptor = Object.getOwnPropertyDescriptor;
          Reflect.ownKeys = function (object: object) {
            if (tracked.has(object)) { ownKeys++; visited.add(object); }
            return originalOwnKeys(object);
          };
          Object.getOwnPropertyDescriptor = function (object: object, key: PropertyKey) {
            if (tracked.has(object)) descriptors++;
            return originalDescriptor(object, key);
          };
          const start = performance.now();
          let clickMs = 0;
          const exists = () => Array.from(shadow.querySelectorAll('[role="treeitem"]'))
            .some(node => node.textContent?.includes(expectedName));
          const observer = new MutationObserver(() => {
            if (exists()) finish();
          });
          function finish(error?: Error) {
            observer.disconnect();
            clearTimeout(timeout);
            Reflect.ownKeys = originalOwnKeys;
            Object.getOwnPropertyDescriptor = originalDescriptor;
            if (error) reject(error);
            else resolve({ clickMs, toDomMs: performance.now() - start, ownKeys, visited: visited.size, descriptors });
          }
          observer.observe(shadow, { childList: true, subtree: true });
          const timeout = setTimeout(() => finish(new Error("Child did not render within 4s")), 4000);
          (icon as HTMLElement).click();
          clickMs = performance.now() - start;
          if (exists()) finish();
        }), childName,
      );
      results.push(result);
      await page.evaluate((name) => {
        delete (SugarCube.State.variables as unknown as Record<string, unknown>)[name];
        delete (window as typeof window & { __inspectorPerfTracked?: WeakSet<object> }).__inspectorPerfTracked;
      }, name);
      await expect(item).toHaveCount(0);
    }
    console.log("INSPECTOR_BENCH " + JSON.stringify({ kind, results }));
  }
});
