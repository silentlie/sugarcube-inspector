import { storyUrl, test } from "./fixtures";

test("diagnose nested Ant flex layout", async ({page}) => {
  await page.goto(storyUrl);
  const drawer = page.locator("sugarcube-inspector");
  const handle = drawer.getByRole("button",{name:"Resize SugarCube Inspector"});
  await handle.press("Enter");
  await handle.hover();
  await drawer.getByRole("tab",{name:"Variables",exact:true}).click();
  await page.waitForTimeout(600);
  console.log("LAYOUT_DIAG:"+JSON.stringify(await drawer.evaluate((host)=>{
    const shadow=host.shadowRoot!;
    const types=[
      "aside","aside > div","aside section",".inspector-tabs",
      ".ant-tabs-content-holder",".ant-tabs-content",".ant-tabs-tabpane",
      ".ant-tabs-tabpane-active",".ant-tabs-tabpane-hidden",
      ".ant-tabs-tabpane > .inspector-tabs",
      ".sugarcube-variable-tree","[aria-label='Story variables tree']",
      ".ant-tree-list-holder"
    ];
    return types.flatMap(selector=>Array.from(shadow.querySelectorAll(selector)).map((element)=>{
      const rect=element.getBoundingClientRect();
      const css=getComputedStyle(element);
      return {selector,tag:element.tagName,cls:element.className?.toString().slice(0,95),
        h:rect.height,w:rect.width,display:css.display,flex:css.flex,
        height:css.height,minHeight:css.minHeight,overflow:css.overflow,visible:css.visibility,
        inner:element.textContent?.slice(0,55)};
    }));
  })));
});
