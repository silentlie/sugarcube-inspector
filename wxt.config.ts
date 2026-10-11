import { defineConfig } from "wxt";

export default defineConfig({
  // The devtools.html entrypoint configures manifest.devtools_page automatically.
  manifest: {
    name: "SugarCube Inspector",
    host_permissions: ["file:///*"],
  },
});
