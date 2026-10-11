import { browser } from "wxt/browser";
import { DebuggerBackend } from "./DebuggerBackend";
import { decodeInspection, inspectInPage } from "./page";
import { isRequest, type InspectorMode, type Inspection, type ModeNotice, type Reply, type Request, type Target } from "./protocol";

export class InspectionService {
  private readonly debugger = new DebuggerBackend((tabId) => {
    const message: ModeNotice = {
      type: "inspector:mode",
      mode: this.debugger.getMode(tabId),
    };
    void browser.tabs.sendMessage(tabId, message).catch(() => {});
    // The side panel may be open on the same tab.
    void browser.runtime.sendMessage({ ...message, tabId }).catch(() => {});
  });

  mode(tabId: number): InspectorMode {
    return this.debugger.getMode(tabId);
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
        nonEnumerable: entry.nonEnumerable,
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

  async handle(tabId: number, request: Request): Promise<Inspection | InspectorMode> {
    switch (request.type) {
      case "inspector:status": return this.debugger.getMode(tabId);
      case "inspector:connect": return this.debugger.connect(tabId);
      case "inspector:disconnect": return this.debugger.disconnect(tabId);
      case "inspector:refresh": return this.debugger.reset(tabId);
      case "inspector:inspect":
        return this.inspect(tabId, request.target, request.offset);
    }
  }
}

export function registerInspectionService(): void {
  const inspection = new InspectionService();
  browser.runtime.onMessage.addListener((input: unknown, sender, respond) => {
    if (!isRequest(input)) return false;
    const tabId = input.type === "inspector:connect" ||
        input.type === "inspector:disconnect"
      ? input.tabId
      : input.type === "inspector:status"
        ? input.tabId ?? sender.tab?.id
        : sender.tab?.id;

    if (tabId === undefined) {
      const reply: Reply = { ok: false, error: "No inspected game tab was found." };
      respond(reply);
      return false;
    }

    void inspection.handle(tabId, input).then(
      (data) => {
        const reply: Reply = { ok: true, data };
        respond(reply);
      },
      (cause: unknown) => {
        const reply: Reply = {
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        };
        respond(reply);
      },
    );
    return true;
  });
}
