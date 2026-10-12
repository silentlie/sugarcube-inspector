import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { variableWatcher } from "../inspection/variableWatcher";
import VariableTree from "./VariableTree";

type Section = "overview" | "variables" | "scripts";
type VariableScope = "story" | "temporary" | "favorites";

/** Entire tree and all subscriptions run in SugarCube's MAIN JS world. */
export default function DirectInspector() {
  const [section, setSection] = useState<Section>("overview");
  const [scope, setScope] = useState<VariableScope>("story");

  useEffect(() => {
    const passages = document.getElementById("passages");
    if (!passages) return;
    const observer = new MutationObserver(() => variableWatcher.refresh());
    observer.observe(passages, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <Box component="section">
      <Stack direction="row" alignItems="center" justifyContent="space-between">
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
            <Tab value="story" label="Story Variables" />
            <Tab value="temporary" label="Temporary Variables" />
            <Tab value="favorites" label="Favorites" />
          </Tabs>
          {scope !== "favorites" && <VariableTree scope={scope} />}
        </Box>
      )}
      {section === "overview" && <Box role="tabpanel" aria-labelledby="inspector-overview" />}
      {section === "scripts" && <Box role="tabpanel" aria-labelledby="inspector-scripts" />}
    </Box>
  );
}
