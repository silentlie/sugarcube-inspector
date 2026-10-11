import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "SugarCube Inspector",
    permissions: ["scripting", "tabs", "debugger"],
    host_permissions: ["file:///*"],
    action: { default_title: "SugarCube Inspector" },
  },
});
