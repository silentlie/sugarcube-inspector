import { browser } from "wxt/browser";
import { mountPanelDashboard } from "@/src/devtools/panelDashboard";
import { detectSugarCube } from "@/src/devtools/detectSugarCube";
import { evaluateWithCallback } from "@/src/devtools/callbackApi";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
if (!status || !refreshButton) throw new Error("Missing DevTools panel controls.");

const evalPage = browser.devtools.inspectedWindow.eval as unknown as
  (expression: string, done: (result: unknown, exceptionInfo?: unknown) => void) => void;

mountPanelDashboard(status, refreshButton, {
  detectSugarCube: () => detectSugarCube((expression) =>
    evaluateWithCallback((done) => evalPage(expression, done)),
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
