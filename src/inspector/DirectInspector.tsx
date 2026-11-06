import { Divider, Tabs, Typography } from "antd";
import { useEffect, useState } from "react";
import { hasState, type VariableStoreKey } from "../sugarcube/state";
import VariableTree, { FavoritesTree } from "../variables/ui/VariableTree";
import { variableWatcher } from "../variables/watcher";

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

  return <InspectorSections />;
}

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
function InspectorSections() {
  const [section, setSection] = useState<Section>("overview");
  const [scope, setScope] = useState<VariableScope>("variables");
  const activeScope = section === "variables" ? scope : null;

  useEffect(() => {
    variableWatcher.setScopeActive("favorites", true);
    return () => variableWatcher.setScopeActive("favorites", false);
  }, []);

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => {
      // TODO: Decide whether passage navigation needs special handling beyond polling.
    });
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  const variables = (
    <Tabs
      activeKey={scope}
      aria-label="Variable scope"
      className="inspector-tabs flex min-h-0 flex-1 flex-col"
      destroyOnHidden={false}
      animated={false}
      onChange={(key) => setScope(key as VariableScope)}
      items={[
        { key: "variables", label: "Story Variables", children: <VariableTree storeKey="variables" active={activeScope === "variables"} /> },
        { key: "temporary", label: "Temporary Variables", children: <VariableTree storeKey="temporary" active={activeScope === "temporary"} /> },
        { key: "favorites", label: "Favorites", children: <FavoritesTree active={activeScope === "favorites"} /> },
      ]}
    />
  );

  return (
    <section data-tailwind-layout className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-w-0">
        <Typography.Title level={5} style={{ margin: 0 }}>
          SugarCube Inspector
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          MAIN world · direct references
        </Typography.Text>
      </div>
      <Divider style={{ margin: "12px 0 0" }} />
      <Tabs
        activeKey={section}
        aria-label="Inspector sections"
        className="inspector-tabs flex min-h-0 flex-1 flex-col"
        destroyOnHidden={false}
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
