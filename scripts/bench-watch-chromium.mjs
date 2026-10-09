#!/usr/bin/env node
/**
 * Synthetic SugarCube values, real Chromium MAIN/isolated-world
 * @webext-core/messaging/page transport. CDP invocation excluded from timing.
 * npm run bench:watch:chromium -- results.json
 */
import fs from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

async function bundle(contents, name) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), sourcefile: name, loader: "js" },
    bundle: true, platform: "browser", format: "iife",
    target: "chrome120", write: false, logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

const serverSource = `
import { defineCustomEventMessaging } from "@webext-core/messaging/page";
import { ExperimentalWatchPoller } from "./src/sugarcube/watchPollingVariants";

const rpc = defineCustomEventMessaging({ namespace: "sugarcube-inspector:benchmark:v1" });
let source;
let mutate;
let poller;
rpc.onMessage("reset", ({ data }) => {
  const { kind, size, mode, equality } = data;
  if (kind === "flat") {
    source = Object.fromEntries(Array.from({length:size}, (_,i)=>["k"+i,i]));
    mutate = (i) => { source["k"+(i%size)]++; };
  } else if (kind === "nested") {
    const groups = Math.ceil(size/100);
    source = Object.fromEntries(Array.from({length:groups},(_,g)=>[
      "g"+g,Object.fromEntries(Array.from({length:100},(_,i)=>["p"+i,g*100+i])),
    ]));
    mutate = (i) => { source["g"+(i%groups)]["p"+(i%100)]++; };
  } else if (kind === "array") {
    source = Array.from({length:size},(_,i)=>({id:i,score:i,active:true}));
    mutate = (i) => { source[i%size].score++; };
  } else if (kind === "map") {
    source = new Map(Array.from({length:size},(_,i)=>["k"+i,{score:i}]));
    mutate = (i) => { source.get("k"+(i%size)).score++; };
  } else throw new Error("Unknown scenario: "+kind);
  poller = new ExperimentalWatchPoller(mode,equality);
  return true;
});
rpc.onMessage("poll", ({data}) => {
  if (data.mutate) mutate(data.index);
  return poller.poll(source);
});
rpc.onMessage("final", () => structuredClone(source));
`;

const clientSource = `
import { defineCustomEventMessaging } from "@webext-core/messaging/page";
import { equalWatchedValues } from "./src/sugarcube/watchEqual";
const rpc = defineCustomEventMessaging({ namespace: "sugarcube-inspector:benchmark:v1" });
let cached;
globalThis.__benchReset = async (data) => {
  cached = undefined;
  return rpc.sendMessage("reset", data);
};
globalThis.__benchPoll = async (mutate, index) => {
  const started = performance.now();
  const response = await rpc.sendMessage("poll", {mutate,index});
  const roundTripMs = performance.now() - started;
  if (response.changed) cached = response.value;
  return {
    roundTripMs,
    mainMs:response.mainMs,
    compareMs:response.compareMs,
    cloneMs:response.cloneMs,
    bytesEstimate:JSON.stringify(response).length,
  };
};
globalThis.__benchVerify = async () => equalWatchedValues(
  cached, await rpc.sendMessage("final",undefined)
);
`;

function stats(values) {
  const ordered = [...values].sort((a,b)=>a-b);
  return {
    p50: +ordered[Math.floor(ordered.length*.5)].toFixed(3),
    p95: +ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))].toFixed(3),
    mean: +(values.reduce((a,b)=>a+b,0)/values.length).toFixed(3),
  };
}

async function main() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld",{
      frameId: frameTree.frame.id, worldName: "WatchBenchmarkIsolated",
    });

    await page.addScriptTag({content: await bundle(serverSource,"watch-server.js")});
    const clientSetup = await cdp.send("Runtime.evaluate",{
      expression: await bundle(clientSource,"watch-client.js"),
      contextId:executionContextId,returnByValue:true,
    });
    if(clientSetup.exceptionDetails) throw new Error(
      "Isolated client injection failed: "+clientSetup.exceptionDetails.text
    );

    async function isolated(expression) {
      const response = await cdp.send("Runtime.evaluate",{
        expression, contextId:executionContextId,
        returnByValue:true,awaitPromise:true,
      });
      if(response.exceptionDetails) throw new Error(
        response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text
      );
      return response.result.value;
    }

    const scenarios = [
      ["flat",10000,0], ["flat",10000,1],
      ["nested",10000,0],["nested",10000,1],
      ["array",10000,0],["array",10000,1],
      ["map",2000,0],["map",2000,1],
    ];
    const variants = [
      ["compare-first","keys-weak"],
      ["compare-first","arrays-weak"],
      ["compare-first","keys-map"],
      ["compare-first","arrays-map"],
      ["compare-first","keys-lazy"],
      ["compare-first","arrays-lazy"],
      ["compare-first","arrays-reverse"],
      ["clone-first","keys-weak"],
      ["always-clone","keys-weak"],
    ];
    const rows=[];
    for(const [kind,size,changeEvery] of scenarios) {
      for(const [mode,equality] of variants) {
        const params={kind,size,mode,equality};
        if(await isolated("globalThis.__benchReset("+JSON.stringify(params)+")") !== true) {
          throw new Error("Reset failed: "+JSON.stringify(params));
        }
        for(let i=0;i<12;i++) await isolated("globalThis.__benchPoll(false,"+i+")");
        const metrics={
          roundTripMs:[],mainMs:[],compareMs:[],cloneMs:[],bytesEstimate:[],
        };
        for(let i=1;i<=35;i++) {
          const changed=changeEvery>0&&i%changeEvery===0;
          const sample=await isolated(
            "globalThis.__benchPoll("+(changed?"true":"false")+","+i+")"
          );
          for(const key of Object.keys(metrics)) metrics[key].push(sample[key]);
        }
        if(!await isolated("globalThis.__benchVerify()")) {
          throw new Error("Wrong inspector value after "+JSON.stringify(params));
        }
        const row={...params,changeEvery,verified:true};
        for(const [name,values] of Object.entries(metrics)) row[name]=stats(values);
        rows.push(row);
        console.log(kind,changeEvery?"changed":"static",mode,equality,
          "RPC",row.roundTripMs.p50,"ms","MAIN",row.mainMs.p50,"ms");
      }
    }
    const data={
      browser:await browser.version(),
      transport:"Real @webext-core/messaging/page CustomEvent between Chrome MAIN and isolated worlds",
      limitation:"Synthetic SugarCube-style values; not running an actual story; CDP invocation excluded.",
      rows,
    };
    if(process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(data,null,2)+"\n");
    console.log("Verified",rows.length,"Chromium RPC scenarios.");
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
