import { storyUrl, test } from "./fixtures";

type Mode = "normal" | "plain" | "noTree" | "noAnt" | "destroy";
type EventMetrics = {
  maxFrameGapMs: number;
  missedFrames60: number;
  gapsOver33: number;
  gapsOver50: number;
  baselineMaxGapMs: number;
  longTaskCount: number;
  longestTaskMs: number;
  longTaskDurations: number[];
  visibleAtMs: number | null;
  mountedRows: number;
  intervals: number[];
};

const cases: { mode: Mode; width: number }[] = [
  { mode: "normal", width: 0 },
  { mode: "normal", width: 1000 },
  { mode: "normal", width: 5000 },
  { mode: "plain", width: 5000 },
  { mode: "noAnt", width: 5000 },
  { mode: "noTree", width: 5000 },
  { mode: "destroy", width: 5000 },
];
const repeats = 3;

test("temporary benchmark animation-frame gaps on tab switches", async ({page}) => {
  test.setTimeout(210_000);
  for (const scenario of cases) {
    for (let sample = 0; sample < repeats; sample++) {
      const p = await page.context().newPage();
      await p.addInitScript((mode: Mode) => {
        (window as Window & {__scFrameBenchMode?: Mode}).__scFrameBenchMode=mode;
      }, scenario.mode);
      await p.goto(storyUrl);
      await p.evaluate(({width}) => {
        const store=SugarCube.State.variables as unknown as Record<string,unknown>;
        for(let i=0;i<width;i++) store[`perf${String(i).padStart(5,"0")}`]=i;
      }, {width:scenario.width});
      const host=p.locator("sugarcube-inspector");
      const handle=host.getByRole("button",{name:"Resize SugarCube Inspector"});
      await handle.press("Enter"); await handle.hover();
      const variables=host.getByRole("tab",{name:"Variables",exact:true});
      const overview=host.getByRole("tab",{name:"Overview"});
      const metrics:EventMetrics[]=[];
      for(let cycle=0;cycle<3;cycle++) {
        const value=await variables.evaluate(async tab => {
          type Measure = EventMetrics;
          const shadow=tab.getRootNode() as ShadowRoot;
          const mode=(window as Window & {__scFrameBenchMode?:Mode}).__scFrameBenchMode ?? "normal";
          const selector= mode==="noTree"?"[data-frame-no-tree]":
            mode==="noAnt"?"[data-frame-no-ant]":'[role="tree"][aria-label="Story variables tree"]';
          const baseline:number[]=[];
          // 12 frames establish whether the CI renderer is running at 60 Hz.
          await new Promise<void>(resolve=>{
            const tick=(ts:number)=>{
              baseline.push(ts);
              if (baseline.length<12) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          const baselineIntervals=baseline.slice(1).map((t,i)=>t-baseline[i]!);
          const longTasks: {startTime:number;duration:number}[]=[];
          let observer:PerformanceObserver|undefined;
          if(PerformanceObserver.supportedEntryTypes.includes("longtask")){
            observer=new PerformanceObserver(list=>{
              for(const e of list.getEntries())longTasks.push({
                startTime:e.startTime,duration:e.duration,
              });
            });
            observer.observe({entryTypes:["longtask"]});
          }
          const times: number[]=[baseline[baseline.length-1]!];
          let start=0;
          const raf=async()=>{
            await new Promise<void>(resolve=>{
              const tick=(ts:number)=>{
                times.push(ts);
                if (performance.now() < start+520)requestAnimationFrame(tick);
                else resolve();
              };
              requestAnimationFrame(tick);
            });
          };
          const clickTime=performance.now();
          start=clickTime;
          const measuring=raf();
          (tab as HTMLElement).click();
          let visibleAt:number|null=null;
          const targetReady=()=>{
            const node=shadow.querySelector(selector);
            return tab.getAttribute("aria-selected")==="true" &&
              !!node && node.getBoundingClientRect().height>0;
          };
          if(targetReady())visibleAt=performance.now()-start;
          if(visibleAt===null){
            await new Promise<void>(resolve=>{
              const mutation=new MutationObserver(()=>{
                if(targetReady()){
                  visibleAt=performance.now()-start; mutation.disconnect();resolve();
                }
              });
              mutation.observe(shadow,{subtree:true,childList:true,attributes:true});
              window.setTimeout(()=>{mutation.disconnect();resolve();},400);
            });
          }
          await measuring;
          // Wait one additional task to let the observer report completed LongTasks.
          await new Promise<void>(resolve=>setTimeout(resolve,0));
          observer?.disconnect();
          const intervals=times.slice(1).map((t,i)=>t-times[i]!);
          const baselineMaxGapMs=Math.max(...baselineIntervals);
          // Keep a fixed 60 Hz reporting budget, but show the baseline too.
          const missedFrames60=intervals.reduce((sum,gap)=>sum+Math.max(0,Math.floor((gap+0.25)/16.667)-1),0);
          const filtered=longTasks.filter(e=>e.startTime>=start-1 && e.startTime<start+520);
          return {
            maxFrameGapMs:Math.max(...intervals),
            missedFrames60,
            gapsOver33:intervals.filter(ms=>ms>33.33).length,
            gapsOver50:intervals.filter(ms=>ms>50).length,
            baselineMaxGapMs,
            longTaskCount:filtered.length,
            longestTaskMs:Math.max(0,...filtered.map(e=>e.duration)),
            longTaskDurations:filtered.map(e=>e.duration),
            visibleAtMs:visibleAt,
            mountedRows:shadow.querySelectorAll('[role="treeitem"]').length,
            intervals,
          } satisfies Measure;
        });
        metrics.push(value);
        await overview.click();
        await p.waitForTimeout(85);
      }
      console.log("FRAME_BENCH:"+JSON.stringify({...scenario,sample,metrics}));
      await p.close();
    }
  }
});
