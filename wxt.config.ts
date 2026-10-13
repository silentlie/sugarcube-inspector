import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SugarCube Inspector (Direct MAIN POC)",
    host_permissions: ["file:///*"],
    action: { default_title: "SugarCube Inspector (Direct MAIN POC)" },
  },
});
