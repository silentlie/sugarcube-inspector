import { expect, storyUrl, test } from "./fixtures";

test("temporary inspect Ant virtual tree DOM", async ({page}) => {
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).press("Enter");
  await drawer.getByRole("button", { name: "Resize SugarCube Inspector" }).hover();
  await drawer.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(drawer.getByText("score", { exact: true })).toBeVisible();
  const dump = async (phase: string) => {
    const data = await drawer.evaluate((host) => {
      const shadow = host.shadowRoot!;
      const t = shadow.querySelector(".ant-tree");
      return {
        tree: t?.outerHTML.slice(0, 7000),
        rows: Array.from(shadow.querySelectorAll('[role="treeitem"]')).map(el=>({
          id:el.id,
          text:el.textContent?.slice(0,100),
          aria:el.getAttribute("aria-label"),
          title:el.getAttribute("title"),
          outer:el.outerHTML.slice(0,900)
        })),
        scroll: Array.from(shadow.querySelectorAll(".rc-virtual-list-holder")).map(el=>({
          top:el.scrollTop,height:el.clientHeight,scrollHeight:el.scrollHeight
        }))
      };
    });
    console.log("TREE_DEBUG:"+phase+":"+JSON.stringify(data));
  };
  await dump("initial");
  await page.evaluate(() => {
    (SugarCube.State.variables as unknown as Record<string, unknown>).player = {health:10};
  });
  await drawer.getByRole("button", { name: "Refresh variables" }).click();
  await page.waitForTimeout(300);
  await dump("afterMutation");
});