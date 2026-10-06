import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  manifest: {
    name: "SugarCube Inspector",

    permissions: ["scripting"],

    host_permissions: ["file:///*"],

    action: {
      default_title: "SugarCube Inspector",
    },
  },
});
