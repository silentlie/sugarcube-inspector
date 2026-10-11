import { browser } from "wxt/browser";
import { detectSugarCube } from "@/src/devtools/detectSugarCube";
import { initializeDevtoolsPanel } from "@/src/devtools/initializeDevtoolsPanel";
import "./style.css";

const status = document.querySelector<HTMLElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
if (!status || !refreshButton) throw new Error("Missing DevTools panel controls.");

void initializeDevtoolsPanel(status, refreshButton, {
  detectSugarCube: () => detectSugarCube((expression) =>
    browser.devtools.inspectedWindow.eval(expression),
  ),
  createSidebarPane: (title) =>
    browser.devtools.panels.elements.createSidebarPane(title),
  onNavigated: (listener) => {
    browser.devtools.network.onNavigated.addListener(listener);
  },
}).catch((error: unknown) => {
  status.textContent = `Could not initialize native inspector: ${error instanceof Error ? error.message : String(error)}`;
  refreshButton.disabled = true;
  console.error("[SugarCube Inspector] Initialization failed:", error);
});
