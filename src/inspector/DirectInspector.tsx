import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { hasState, type VariableStoreKey } from "../inspection/direct";
import { variableWatcher } from "../inspection/variableWatcher";
import VariableTree from "./VariableTree";

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
      <Box component="section" role="status" aria-busy="true">
        <Typography variant="body2" color="text.secondary">
          Waiting for SugarCube...
        </Typography>
      </Box>
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

  return (
    <Box component="section">
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h6">SugarCube Inspector</Typography>
          <Typography variant="caption" color="text.secondary">
            MAIN world · direct references
          </Typography>
        </Box>
        <IconButton aria-label="Refresh variables" title="Refresh variables"
          onClick={() => variableWatcher.refresh()}>
          <RefreshCw size={18} />
        </IconButton>
      </Stack>
      <Divider />
      <Tabs value={section} aria-label="Inspector sections" variant="scrollable"
        scrollButtons="auto" onChange={(_, value: Section) => setSection(value)}>
        <Tab value="overview" label="Overview" id="inspector-overview" />
        <Tab value="variables" label="Variables" id="inspector-variables" />
        <Tab value="scripts" label="Scripts" id="inspector-scripts" />
      </Tabs>
      {section === "variables" && (
        <Box role="tabpanel" aria-labelledby="inspector-variables">
          <Tabs value={scope} aria-label="Variable scope" variant="scrollable"
            scrollButtons="auto" onChange={(_, value: VariableScope) => setScope(value)}>
            <Tab value="variables" label="Story Variables" />
            <Tab value="temporary" label="Temporary Variables" />
            <Tab value="favorites" label="Favorites" />
          </Tabs>
          {scope !== "favorites" && <VariableTree storeKey={scope} />}
        </Box>
      )}
      {section === "overview" && <Box role="tabpanel" aria-labelledby="inspector-overview" />}
      {section === "scripts" && <Box role="tabpanel" aria-labelledby="inspector-scripts" />}
    </Box>
  );
}
