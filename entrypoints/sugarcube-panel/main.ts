import { browser } from "wxt/browser";
import { mountPanelDashboard } from "@/src/devtools/panelDashboard";
import { detectSugarCube } from "@/src/devtools/detectSugarCube";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
if (!status || !refreshButton) throw new Error("Missing DevTools panel controls.");

mountPanelDashboard(status, refreshButton, {
  async detectSugarCube(): Promise<boolean> {
    return detectSugarCube((expression) =>
      browser.devtools.inspectedWindow.eval(expression),
    );
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
