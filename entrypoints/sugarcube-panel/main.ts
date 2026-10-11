import { browser } from "wxt/browser";
import { mountPanelDashboard } from "@/src/devtools/panelDashboard";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
if (!status || !refreshButton) throw new Error("Missing DevTools panel controls.");

mountPanelDashboard(status, refreshButton, {
  async detectSugarCube(): Promise<boolean> {
    const response: unknown = await browser.devtools.inspectedWindow.eval(
      "Boolean(globalThis.SugarCube && globalThis.SugarCube.State)",
    );
    if (!Array.isArray(response)) throw new Error("Unexpected DevTools evaluation response.");
    const [value, exception] = response;
    if (exception) throw new Error("DevTools evaluation failed.");
    return value === true;
  },
  async refreshSidebars(): Promise<void> {
    const response: unknown = await browser.runtime.sendMessage({
      type: "sugarcube:refresh",
      tabId: browser.devtools.inspectedWindow.tabId,
    });
    if (typeof response !== "object" || response === null ||
        !("ok" in response) || response.ok !== true) {
      throw new Error("The DevTools inspector is not responding.");
    }
  },
});
