import { describe, it, expect } from "vitest";
import { isExpandableNode } from "../inspection/isExpandableNode";
import { getLocationName } from "../inspection/variableStructure";
import { getVariableChildren, type VariableNode } from "../inspection/variableTree";
import { reconcileChildren, refreshItem, updateTreeItem, type Item } from "./variableTreeItems";

function recursive(nodes: VariableNode[], old: Item[] = []): Item[] {
  const prior = new Map(old.map((item) => [item.key, item]));
  return nodes.map((node) => {
    const isLeaf = !isExpandableNode(node);
    const prev = prior.get(node.id);
    const children = !isLeaf && prev?.children
      ? recursive(getVariableChildren(node), prev.children) : undefined;
    return { key: node.id, title: getLocationName(node.location), variable: node, isLeaf,
      ...(children && { children }) };
  });
}
function rootNode(data: object): VariableNode {
  return { id: "root", location: {kind:"property",owner:{data},key:"data"},ancestors:[] };
}
function expand(items: Item[], indices: number[], variant: "recursive" | "shared"): Item[] {
  for (const index of indices) {
    const item = items[index]!;
    items = updateTreeItem(items, item.key, (old) => variant === "shared"
      ? refreshItem(old, true)
      : {...old, children: recursive(getVariableChildren(old.variable))});
  }
  return items;
}
function sample(work: () => unknown, runs: number) {
  for (let i = 0; i < 12; i++) work();
  const timings: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    work();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  return {
    medianMs: Math.round(timings[Math.floor(runs / 2)]! * 1000) / 1000,
    meanMs: Math.round(timings.reduce((a, b) => a + b, 0) / runs * 1000) / 1000,
    p95Ms: Math.round(timings[Math.min(runs-1,Math.floor(runs*0.95))]! * 1000) / 1000,
  };
}
describe.skipIf(process.env.SC_TREE_BENCH !== "1")("reconciliation CPU benchmark", () => {
  for (const size of [200, 2_000, 10_000]) {
    it(`compares identical work at ${size} root nodes`, () => {
      const data: Record<string, unknown> = Object.fromEntries(
        Array.from({length:size}, (_, i) => [`item${i}`, i]));
      for (let i = 0; i < 5; i++) {
        data[`item${i}`] = Object.fromEntries(
          Array.from({length:60},(_, j) => [`nested${j}`,j]));
      }
      const root = rootNode(data);
      const current = getVariableChildren(root);
      const baseline = expand(recursive(current), [0,1,2,3,4], "recursive");
      const shared = expand(reconcileChildren(current), [0,1,2,3,4], "shared");
      expect(reconcileChildren(current,shared)).toBe(shared);
      // The root watcher can observe new membership without walking loaded children.
      data.newVariable = "added";
      const added = getVariableChildren(root);
      delete data.newVariable;
      const changed = data.item0 as Record<string, unknown>;
      changed.nested2 = 999;
      const nestedRoot = shared[0]!;
      const nestedOld = baseline[0]!;
      const newOwner = {...(data.item1 as Record<string, unknown>)};
      const replacedData = {...data, item1:newOwner};
      const ownerRoot = rootNode(replacedData);
      const ownerBefore = getVariableChildren(ownerRoot);
      const ownerOld = reconcileChildren(current,shared);
      const ownerBaseline = recursive(current,baseline);
      const cases = [
        {scenario:"unchanged-root", old:baseline, current:shared,
          before: current, sharedNodes: current},
        {scenario:"added-root-property", old:baseline, current:shared,
          before:added, sharedNodes:added},
        {scenario:"replaced-expanded-object", old:ownerBaseline, current:ownerOld,
          before:ownerBefore, sharedNodes:ownerBefore},
      ];
      const runs=size>=10000?40:80;
      for(const c of cases) {
        const baselineCost=sample(()=>recursive(c.before,c.old),runs);
        const sharedCost=sample(()=>reconcileChildren(c.sharedNodes,c.current),runs);
        console.log("TREE_RECONCILE_BENCH="+JSON.stringify({
          size,scenario:c.scenario,baseline:baselineCost,shared:sharedCost,
          initialReusesArray: c.scenario==="unchanged-root" &&
            reconcileChildren(c.sharedNodes,c.current)===c.current
        }));
      }
      const baselineBranch = sample(
        ()=>recursive(getVariableChildren(nestedOld.variable),nestedOld.children),runs);
      const sharedBranch = sample(()=>refreshItem(nestedRoot,true),runs);
      console.log("TREE_RECONCILE_BENCH="+JSON.stringify({
        size,scenario:"direct-expanded-refresh",baseline:baselineBranch,shared:sharedBranch,
        initialReusesArray:false
      }));
    });
  }
});
