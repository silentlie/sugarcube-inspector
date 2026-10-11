import { browser } from "wxt/browser";
import { registerNativeInspector } from "@/src/devtools/nativeInspector";

const inspectedTabId = browser.devtools.inspectedWindow.tabId;

void registerNativeInspector({
  createSidebarPane: (title) =>
    browser.devtools.panels.elements.createSidebarPane(title),
  createPanel: () =>
    browser.devtools.panels.create("SugarCube", "icon/16.png", "sugarcube-panel.html"),
  onNavigated: (listener) => {
    browser.devtools.network.onNavigated.addListener(listener);
  },
  onRefreshRequested: (refresh) => {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const request = message as Record<string, unknown>;
      if (request.type !== "sugarcube:refresh" || request.tabId !== inspectedTabId) return;
      return refresh().then(() => ({ ok: true }));
    });
  },
}).catch((error: unknown) => {
  console.error("[SugarCube Inspector] Failed to initialize DevTools views:", error);
});
