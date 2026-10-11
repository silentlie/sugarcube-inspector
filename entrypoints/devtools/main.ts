import { browser } from "wxt/browser";
import { registerNativeInspector, type NativeSidebar } from "@/src/devtools/nativeInspector";
import {
  callbackDone,
  callbackResult,
  createRefreshMessageHandler,
} from "@/src/devtools/callbackApi";

const inspectedTabId = browser.devtools.inspectedWindow.tabId;

// Use callback signatures until Chrome 151/152 promise support is widespread.
type CallbackSidebar = {
  onShown: NativeSidebar["onShown"];
  setExpression(expression: string, rootTitle: string, done: () => void): void;
};

const createPane = browser.devtools.panels.elements.createSidebarPane as unknown as
  (title: string, done: (pane: CallbackSidebar) => void) => void;
const createPanel = browser.devtools.panels.create as unknown as
  (title: string, icon: string, page: string, done: () => void) => void;

void registerNativeInspector({
  async createSidebarPane(title) {
    const pane = await callbackResult<CallbackSidebar>(
      (done) => createPane(title, done),
    );
    return {
      onShown: pane.onShown,
      setExpression: (expression, rootTitle) => callbackDone(
        (done) => pane.setExpression(expression, rootTitle ?? "", done),
      ),
    };
  },
  createPanel: () => callbackDone(
    (done) => createPanel("SugarCube", "icon/16.png", "sugarcube-panel.html", done),
  ),
  onNavigated: (listener) => {
    browser.devtools.network.onNavigated.addListener(listener);
  },
  onRefreshRequested: (refresh) => {
    browser.runtime.onMessage.addListener(createRefreshMessageHandler(inspectedTabId, refresh));
  },
}).catch((error: unknown) => {
  console.error("[SugarCube Inspector] Failed to initialize DevTools views:", error);
});
