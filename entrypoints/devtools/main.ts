import { browser } from "wxt/browser";

// The DevTools bootstrap owns only panel registration. The panel itself owns
// native sidebar panes, so Refresh never needs runtime message relaying.
void browser.devtools.panels.create(
  "SugarCube",
  "icon/16.png",
  "sugarcube-panel.html",
).catch((error: unknown) => {
  console.error("[SugarCube Inspector] Could not create DevTools panel:", error);
});
