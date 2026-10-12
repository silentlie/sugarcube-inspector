import { Button, Divider, Flex, Tabs, Typography } from "antd";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { hasState, type VariableStoreKey } from "../inspection/direct";
import { variableWatcher } from "../inspection/variableWatcher";
import VariableTree from "./VariableTree";
import { benchMode } from "./tabBenchmark.temp";

type Section = "overview" | "variables" | "scripts";
type VariableScope = VariableStoreKey | "favorites";

/** Wait for initialization before any inspection hook can read the State API. */
export default function DirectInspector() {
  const [ready, setReady] = useState(hasState);

  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => {
      if (hasState()) setReady(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [ready]);

  if (!ready) {
    return (
      <section role="status" aria-busy="true">
        <Typography.Text type="secondary">Waiting for SugarCube...</Typography.Text>
      </section>
    );
  }

  return <ReadyInspector />;
}

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
function ReadyInspector() {
  const [section, setSection] = useState<Section>("overview");
  const [scope, setScope] = useState<VariableScope>("variables");

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => variableWatcher.refresh());
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  const variables = (
    <Tabs
      activeKey={scope}
      aria-label="Variable scope"
      className="inspector-tabs"
      destroyOnHidden={benchMode() === "destroy"}
      animated={false}
      onChange={(key) => setScope(key as VariableScope)}
      items={[
        { key: "variables", label: "Story Variables",
          children: benchMode() === "noTree"
            ? <div data-benchmark-no-tree="true" style={{ flex: 1 }} />
            : <VariableTree storeKey="variables" /> },
        { key: "temporary", label: "Temporary Variables", children: <VariableTree storeKey="temporary" /> },
        { key: "favorites", label: "Favorites" },
      ]}
    />
  );

  return (
    <section style={{
      display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
      overflow: "hidden",
    }}>
      <Flex align="center" justify="space-between">
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            SugarCube Inspector
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            MAIN world · direct references
          </Typography.Text>
        </div>
        <Button type="text" aria-label="Refresh variables" title="Refresh variables"
          icon={<RefreshCw size={18} />}
          onClick={() => variableWatcher.refresh()} />
      </Flex>
      <Divider style={{ margin: "12px 0 0" }} />
      <Tabs
        activeKey={section}
        aria-label="Inspector sections"
        className="inspector-tabs"
        destroyOnHidden={benchMode() === "destroy"}
        animated={false}
        onChange={(key) => setSection(key as Section)}
        items={[
          { key: "overview", label: "Overview" },
          { key: "variables", label: "Variables", children: variables },
          { key: "scripts", label: "Scripts" },
        ]}
      />
    </section>
  );
}
