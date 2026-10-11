import { browser } from "wxt/browser";
import { registerNativeInspector } from "@/src/devtools/nativeInspector";
import { createRefreshMessageHandler } from "@/src/devtools/callbackApi";

const inspectedTabId = browser.devtools.inspectedWindow.tabId;

// Chrome 155 supports the promise-based DevTools APIs. Do not pass a callback
// as setExpression's third argument: that slot is evaluation options.
void registerNativeInspector({
  createSidebarPane: (title) =>
    browser.devtools.panels.elements.createSidebarPane(title),
  createPanel: () =>
    browser.devtools.panels.create("SugarCube", "icon/16.png", "sugarcube-panel.html"),
  onNavigated: (listener) => {
    browser.devtools.network.onNavigated.addListener(listener);
  },
  onRefreshRequested: (refresh) => {
    browser.runtime.onMessage.addListener(createRefreshMessageHandler(inspectedTabId, refresh));
  },
}).catch((error: unknown) => {
  console.error("[SugarCube Inspector] Failed to initialize DevTools views:", error);
});
