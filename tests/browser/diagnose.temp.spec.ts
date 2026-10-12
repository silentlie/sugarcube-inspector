import { storyUrl, test } from "./fixtures";
test("temporary Ant element chain", async ({page}) => {
  await page.goto(storyUrl);
  const host=page.locator("sugarcube-inspector");
  const handle=host.getByRole("button",{name:"Resize SugarCube Inspector"});
  await handle.press("Enter"); await handle.hover();
  await host.getByRole("tab",{name:"Variables",exact:true}).click();
  await page.waitForTimeout(650);
  console.log("CHAIN_DIAG:"+JSON.stringify(await host.evaluate(el=>{
    const shadow=el.shadowRoot!;
    const nodes=Array.from(shadow.querySelectorAll(".inspector-tabs,.ant-tabs-content,[role=tabpanel]"));
    return nodes.map(node=>{
      const path=[];let cursor:Element|null=node;
      for(let i=0;cursor&&i<8;i++,cursor=cursor.parentElement){
        const rect=cursor.getBoundingClientRect(),css=getComputedStyle(cursor);
        path.push({tag:cursor.tagName,cls:typeof cursor.className==="string"?cursor.className.slice(0,95):"",
          display:css.display,flex:css.flex,rectHeight:rect.height,computedHeight:css.height,
          minHeight:css.minHeight,overflow:css.overflow});
      }
      return {target:path[0],path};
    });
  })));
});
