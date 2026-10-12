import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { variableWatcher } from "../inspection/variableWatcher";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import VariableTree from "./VariableTree";

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
export default function DirectInspector() {
  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => variableWatcher.refresh());
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <section>
      <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-lg font-semibold">SugarCube Inspector</h1>
          <p className="text-xs text-sky-300">MAIN world · direct references</p>
        </div>
        <button type="button" aria-label="Refresh variables" title="Refresh variables"
          className="rounded p-2 text-zinc-300 hover:bg-zinc-800"
          onClick={() => variableWatcher.refresh()}>
          <RefreshCw size={16} />
        </button>
      </header>
      <Tabs defaultValue="overview">
        <TabsList aria-label="Inspector sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p className="py-2 text-xs text-zinc-500">
            Live variable tiles update independently without copying game values.
          </p>
          <Tabs defaultValue="story">
            <TabsList aria-label="Variable scope">
              <TabsTrigger value="story">Story Variables</TabsTrigger>
              <TabsTrigger value="temporary">Temporary Variables</TabsTrigger>
            </TabsList>
            <TabsContent value="story">
              <VariableTree scope="story" />
            </TabsContent>
            <TabsContent value="temporary">
              <VariableTree scope="temporary" />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="favorites" />
        <TabsContent value="scripts" />
      </Tabs>
    </section>
  );
}
