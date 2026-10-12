import { expect, storyUrl, test } from "./fixtures";

type Mode = "normal" | "destroy" | "noTree" | "noAnt" | "plain" | "capped";
type Measure = { name: string; at: number; ms: number };
type ClickResult = {
  domMs: number;
  frameMs: number;
  renderedRows: number;
  events: Measure[];
};
const cases = Array.from({length:3}, (_, repetition) =>
  (["normal", "noAnt", "plain", "capped"] as const).flatMap(mode =>
    [1000, 5000].map(width => ({ mode, width, repetition }))),
).flat();


test("temporary benchmark: cold/warm tabs and tree pipeline", async ({page}) => {
  test.setTimeout(175_000);
  for (const scenario of cases) {
    const p = await page.context().newPage();
    await p.addInitScript((mode: Mode) => {
      (window as Window & { __scTabBenchmark?: {
        mode: Mode; measures: Measure[];
      } }).__scTabBenchmark = { mode, measures: [] };
    }, scenario.mode);
    await p.goto(storyUrl);
    await p.evaluate(({width, nested}) => {
      const vars = SugarCube.State.variables as unknown as Record<string, unknown>;
      for (let i = 0; i < width; i++) vars[`bench${String(i).padStart(5,"0")}`] = i;
      if (nested) {
        const nodes: object[] = [{}];
        for(let i=1;i<10000;i++){
          const parent=nodes[Math.floor((i-1)/20)]!;
          const child: object = i%4===0 ? {} : i%4===1 ? [] :
            i%4===2 ? new Map() : new Set();
          if(Array.isArray(parent))parent.push(child);
          else if(parent instanceof Map)parent.set(`child${i}`,child);
          else if(parent instanceof Set)parent.add(child);
          else (parent as Record<string,object>)[`child${i}`]=child;
          nodes.push(child);
        }
        vars.benchNested10000=nodes[0];
      }
    }, {width: scenario.width, nested: false});
    const drawer = p.locator("sugarcube-inspector");
    const handle = drawer.getByRole("button", {name:"Resize SugarCube Inspector"});
    await handle.press("Enter");
    await handle.hover();
    const variables = drawer.getByRole("tab", {name:"Variables", exact:true});
    const overview = drawer.getByRole("tab", {name:"Overview"});
    const samples: ClickResult[] = [];
    for(let trial=0;trial<3;trial++){
      const result = await variables.evaluate(async (el):Promise<ClickResult> => {
        const shadow=el.getRootNode() as ShadowRoot;
        const state=(window as Window & {__scTabBenchmark?: {
          mode:Mode; measures:Measure[];
        }}).__scTabBenchmark!;
        state.measures=[];
        const start=performance.now();
        const isReady = ()=>{
          if (el.getAttribute("aria-selected") !== "true") return false;
          const selector=state.mode==="noTree"?"[data-benchmark-no-tree]":
            state.mode==="noAnt"?"[data-benchmark-no-ant]":
              '[role="tree"][aria-label="Story variables tree"]';
          const target=shadow.querySelector(selector);
          return !!target && target.getBoundingClientRect().height>0;
        };
        const domMs = await new Promise<number>((resolve,reject)=>{
          let finished=false;
          const observer=new MutationObserver(()=>{
            if(!finished && isReady()){
              finished=true;observer.disconnect();clearTimeout(timeout);
              resolve(performance.now()-start);
            }
          });
          const timeout=setTimeout(()=>{
            observer.disconnect();
            reject(new Error("Tab never became ready, mode="+state.mode+
              ",DOM="+shadow.querySelectorAll('[role="tree"]').length));
          },7500);
          observer.observe(shadow,{attributes:true,childList:true,subtree:true});
          (el as HTMLElement).click();
          if(isReady()){
            finished=true;observer.disconnect();clearTimeout(timeout);
            resolve(performance.now()-start);
          }
        });
        await new Promise<void>(resolve=>requestAnimationFrame(()=>
          requestAnimationFrame(()=>resolve())));
        return {
          domMs,
          frameMs:performance.now()-start,
          renderedRows:shadow.querySelectorAll('[role="treeitem"]').length,
          events:state.measures.map(e=>({...e,at:e.at-start})),
        };
      });
      samples.push(result);
      await overview.click();
      await expect(overview).toHaveAttribute("aria-selected","true");
      await p.waitForTimeout(65);
    }
    console.log("TAB_BENCH:"+JSON.stringify({...scenario,samples}));
    await p.close();
  }
});
