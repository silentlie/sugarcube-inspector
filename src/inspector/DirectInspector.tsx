import { Divider, Tabs, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { hasState, type VariableStoreKey } from "../sugarcube/state";
import { connectFavoriteStorage } from "../variables/favorites";
import { variableLocks } from "../variables/locks";
import VariableSearch from "../variables/ui/VariableSearch";
import LockedVariables from "../variables/ui/LockedVariables";
import UndoEdit from "../variables/ui/UndoEdit";
import VariableComparison from "../variables/ui/VariableComparison";
import { PassageSearchContext } from "../variables/ui/VariableDetails";
import { formatFavoritePath, type FavoritePath } from "../variables/location";
import { variableEdits } from "../variables/edits";
import VariableTree, { FavoritesTree, type VariableTreeSearch } from "../variables/ui/VariableTree";
import { variableWatcher } from "../variables/watcher";
import StoryOverview from "./StoryOverview";
import StoryPassages from "./StoryPassages";

type Section = "overview" | "variables" | "passages";
type VariableScope = VariableStoreKey | "favorites" | "locked" | "compare";

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
  const [selectedPassage, setSelectedPassage] = useState<string>();
  const [sourceFocusRequest, setSourceFocusRequest] = useState(0);
  const [sourceSearch, setSourceSearch] = useState("");
  const activeScope = section === "variables" ? scope : null;
  const variablesRef = useRef<VariableTreeSearch>(null);
  const temporaryRef = useRef<VariableTreeSearch>(null);

  useEffect(() => {
    variableWatcher.setScopeActive("favorites", true);
    return () => variableWatcher.setScopeActive("favorites", false);
  }, []);
  useEffect(connectFavoriteStorage, []);
  useEffect(() => variableLocks.clear, []);
  useEffect(() => variableEdits.clear, []);

  const reveal = ({ root, path }: FavoritePath) => {
    const tree = root === "variables" ? variablesRef.current : temporaryRef.current;
    if (!tree?.reveal(path)) return false;
    setScope(root);
    return true;
  };

  const variables = <PassageSearchContext value={(path) => {
    setSelectedPassage(undefined);
    setSourceSearch(formatFavoritePath(path));
    setSourceFocusRequest((count) => count + 1);
    setSection("passages");
  }}>
    <UndoEdit />
    <VariableSearch find={(query) => [
      ...(variablesRef.current?.find(query) ?? []),
      ...(temporaryRef.current?.find(query) ?? []),
    ]} reveal={reveal} />
    <Tabs
      activeKey={scope}
      aria-label="Variable scope"
      className="inspector-tabs flex min-h-0 flex-1 flex-col"
      destroyOnHidden={false}
      animated={false}
      onChange={(key) => setScope(key as VariableScope)}
      items={[
        { key: "variables", label: "Story Variables", forceRender: true, children: <VariableTree storeKey="variables" active={activeScope === "variables"} searchRef={variablesRef} /> },
        { key: "temporary", label: "Temporary Variables", forceRender: true, children: <VariableTree storeKey="temporary" active={activeScope === "temporary"} searchRef={temporaryRef} /> },
        { key: "favorites", label: "Favorites", children: <FavoritesTree active={activeScope === "favorites"} /> },
        { key: "locked", label: "Locked Variables", children: <LockedVariables /> },
        { key: "compare", label: "Compare", children: <VariableComparison reveal={reveal} /> },
      ]}
    />
  </PassageSearchContext>;

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
          { key: "overview", label: "Overview", children: <StoryOverview openSource={(name) => {
            setSelectedPassage(name);
            setSourceSearch("");
            setSourceFocusRequest((count) => count + 1);
            setSection("passages");
          }} /> },
          { key: "variables", label: "Variables", children: variables },
          { key: "passages", label: "Passages", children: <StoryPassages key={sourceFocusRequest} selected={selectedPassage}
            onSelect={setSelectedPassage} focusRequest={sourceFocusRequest} initialQuery={sourceSearch} /> },
        ]}
      />
    </section>
  );
}
