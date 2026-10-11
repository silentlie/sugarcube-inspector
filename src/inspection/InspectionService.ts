import { browser } from "wxt/browser";
import { DebuggerBackend } from "./DebuggerBackend";
import { onMessage, sendMessage } from "./messaging";
import { decodeInspection, inspectInPage } from "./page";
import {
  InspectRequestSchema, StatusRequestSchema, TabRequestSchema,
  type InspectorMode, type Inspection, type Target,
} from "./protocol";

export class InspectionService {
  private readonly debugger = new DebuggerBackend((tabId) => {
    const data = { mode: this.debugger.getMode(tabId), tabId };
    void sendMessage("inspector:mode", data, tabId).catch(() => {});
    // Notify the side panel as well as the inspected tab.
    void sendMessage("inspector:mode", data).catch(() => {});
  });

  mode(tabId: number): InspectorMode {
    return this.debugger.getMode(tabId);
  }

  connect(tabId: number): Promise<InspectorMode> {
    return this.debugger.connect(tabId);
  }

  disconnect(tabId: number): Promise<InspectorMode> {
    return this.debugger.disconnect(tabId);
  }

  refresh(tabId: number): Promise<InspectorMode> {
    return this.debugger.reset(tabId);
  }

  async inspect(tabId: number, target: Target, offset: number): Promise<Inspection> {
    if (this.mode(tabId).mode === "cdp") {
      return this.debugger.inspect(tabId, target, offset);
    }
    if (target.kind !== "path") {
      throw new Error("A debugger handle cannot be used in MAIN-world mode.");
    }
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: inspectInPage,
      args: [target.path, offset],
    });
    if (typeof result?.result !== "string") {
      throw new Error("Could not inspect the live SugarCube page.");
    }
    const page = decodeInspection(result.result);
    return {
      total: page.total,
      offset: page.offset,
      entries: page.entries.map((entry) => ({
        name: entry.name,
        preview: entry.preview,
        expandable: entry.expandable,
        ...(entry.nonEnumerable && { nonEnumerable: true }),
        ...(entry.expandable && {
          target: {
            kind: "path" as const,
            path: {
              root: target.path.root,
              segments: [...target.path.segments, entry.segment],
            },
          },
        }),
      })),
    };
  }
}

function requireTabId(tabId: number | undefined): number {
  if (tabId === undefined) throw new Error("No inspected game tab was found.");
  return tabId;
}

export function registerInspectionService(): void {
  const inspection = new InspectionService();

  onMessage("inspector:status", ({ data, sender }) => {
    const { tabId } = StatusRequestSchema.parse(data);
    return inspection.mode(requireTabId(tabId ?? sender.tab?.id));
  });

  onMessage("inspector:connect", ({ data }) => {
    const { tabId } = TabRequestSchema.parse(data);
    return inspection.connect(tabId);
  });

  onMessage("inspector:disconnect", ({ data }) => {
    const { tabId } = TabRequestSchema.parse(data);
    return inspection.disconnect(tabId);
  });

  onMessage("inspector:refresh", ({ sender }) => {
    return inspection.refresh(requireTabId(sender.tab?.id));
  });

  onMessage("inspector:inspect", ({ data, sender }) => {
    const { target, offset } = InspectRequestSchema.parse(data);
    return inspection.inspect(requireTabId(sender.tab?.id), target, offset);
  });
}
