import { browser } from "wxt/browser";
import { mountPanelDashboard } from "@/src/devtools/panelDashboard";
import { detectSugarCube } from "@/src/devtools/detectSugarCube";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
if (!status || !refreshButton) throw new Error("Missing DevTools panel controls.");

mountPanelDashboard(status, refreshButton, {
  // Chrome 155's promise form avoids ambiguity in the optional options/callback slots.
  detectSugarCube: () => detectSugarCube((expression) =>
    browser.devtools.inspectedWindow.eval(expression),
  ),
  async refreshSidebars(): Promise<void> {
    const response: unknown = await browser.runtime.sendMessage({
      type: "sugarcube:refresh",
      tabId: browser.devtools.inspectedWindow.tabId,
    });
    if (typeof response !== "object" || response === null ||
        !("ok" in response) || response.ok !== true) {
      const message = response && typeof response === "object" &&
        "error" in response && typeof response.error === "string"
        ? response.error : "The DevTools inspector is not responding.";
      throw new Error(message);
    }
  },
});
