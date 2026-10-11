import { browser } from "wxt/browser";
import { detectSugarCube } from "@/src/devtools/detectSugarCube";
import { initializeDevtoolsPanel } from "@/src/devtools/initializeDevtoolsPanel";
import { decodeInspection, inspectExpression } from "@/src/devtools/lazyInspection";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
const variableContainer = document.querySelector<HTMLElement>("#variables");
if (!status || !refreshButton || !variableContainer) {
  throw new Error("Missing DevTools panel controls.");
}

void initializeDevtoolsPanel(status, refreshButton, variableContainer, {
  detectSugarCube: () => detectSugarCube((expression) =>
    browser.devtools.inspectedWindow.eval(expression),
  ),
  async inspect(path, offset) {
    const response: unknown = await browser.devtools.inspectedWindow.eval(
      inspectExpression(path, offset),
    );
    return decodeInspection(response);
  },
  createSidebarPane: (title) =>
    browser.devtools.panels.elements.createSidebarPane(title),
  onNavigated: (listener) => {
    browser.devtools.network.onNavigated.addListener(listener);
  },
}).catch((error: unknown) => {
  status.textContent = `Could not initialize inspector: ${error instanceof Error ? error.message : String(error)}`;
  refreshButton.disabled = true;
  console.error("[SugarCube Inspector] Initialization failed:", error);
});
