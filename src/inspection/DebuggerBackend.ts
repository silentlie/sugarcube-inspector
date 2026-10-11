import { browser } from "wxt/browser";
import type { Entry, Inspection, InspectorMode, Target } from "./protocol";

type Remote = {
  type: string;
  subtype?: string;
  className?: string;
  description?: string;
  objectId?: string;
  value?: unknown;
  unserializableValue?: string;
};

type Descriptor = {
  name: string;
  value?: Remote;
  get?: Remote;
  set?: Remote;
  enumerable?: boolean;
};
type PropertyReply = {
  result: Descriptor[];
  privateProperties?: Descriptor[];
  internalProperties?: Descriptor[];
  exceptionDetails?: { text?: string };
};
type Evaluation = { result: Remote; exceptionDetails?: { text?: string } };
type Session = {
  id: string;
  group: string;
  handles: Set<string>;
};
const PAGE_SIZE = 100;

function describe(value?: Remote): string {
  if (!value) return "undefined";
  if (value.subtype === "null") return "null";
  if (value.unserializableValue) return value.unserializableValue;
  if (value.type === "string" && typeof value.value === "string") {
    return JSON.stringify(value.value.length > 100
      ? value.value.slice(0, 100) + "…" : value.value);
  }
  if (value.type === "function") return value.description ?? "[Function]";
  if (value.value !== undefined) return String(value.value);
  return value.description ?? value.className ?? value.type;
}

/** CDP session and remote handles are owned solely by the background. */
export class DebuggerBackend {
  private readonly sessions = new Map<number, Session>();
  private readonly pending = new Map<number, Promise<InspectorMode>>();

  constructor(private readonly modeChanged: (tabId: number) => void) {
    browser.debugger.onDetach.addListener((source) => {
      if (source.tabId === undefined) return;
      if (this.sessions.delete(source.tabId)) this.modeChanged(source.tabId);
    });
    browser.debugger.onEvent.addListener((source, method) => {
      if (source.tabId === undefined || method !== "Runtime.executionContextsCleared") return;
      if (!this.sessions.delete(source.tabId)) return;
      this.modeChanged(source.tabId);
      void browser.debugger.detach({ tabId: source.tabId }).catch(() => {});
    });
  }

  getMode(tabId: number): InspectorMode {
    const session = this.sessions.get(tabId);
    return session
      ? { mode: "cdp", sessionId: session.id }
      : { mode: "main" };
  }

  private command<T>(tabId: number, method: string, params?: Record<string, unknown>) {
    return browser.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
  }

  connect(tabId: number): Promise<InspectorMode> {
    if (this.sessions.has(tabId)) return Promise.resolve(this.getMode(tabId));
    const existing = this.pending.get(tabId);
    if (existing) return existing;
    const attempt = this.attach(tabId).finally(() => { this.pending.delete(tabId); });
    this.pending.set(tabId, attempt);
    return attempt;
  }

  private async attach(tabId: number): Promise<InspectorMode> {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url?.startsWith("file://")) throw new Error("Open a local SugarCube story first.");
    await browser.debugger.attach({ tabId }, "1.3");

    try {
      await this.command(tabId, "Runtime.enable");
      const result = await this.command<Evaluation>(tabId, "Runtime.evaluate", {
        expression: "Boolean(globalThis.SugarCube?.State)",
        returnByValue: true,
        silent: true,
      });
      if (result.exceptionDetails || result.result.value !== true) {
        throw new Error("SugarCube is not ready in this tab.");
      }

      this.sessions.set(tabId, {
        id: crypto.randomUUID(),
        group: "sugarcube-inspector:" + crypto.randomUUID(),
        handles: new Set(),
      });
      this.modeChanged(tabId);
      return this.getMode(tabId);
    } catch (error) {
      await browser.debugger.detach({ tabId }).catch(() => {});
      throw error;
    }
  }

  async disconnect(tabId: number): Promise<InspectorMode> {
    const pending = this.pending.get(tabId);
    if (pending) await pending.catch(() => {});
    const session = this.sessions.get(tabId);
    if (!session) return this.getMode(tabId);
    this.sessions.delete(tabId);
    await this.command(tabId, "Runtime.releaseObjectGroup", {
      objectGroup: session.group,
    }).catch(() => {});
    await browser.debugger.detach({ tabId }).catch(() => {});
    this.modeChanged(tabId);
    return this.getMode(tabId);
  }

  async reset(tabId: number): Promise<InspectorMode> {
    const session = this.sessions.get(tabId);
    if (!session) return this.getMode(tabId);
    await this.command(tabId, "Runtime.releaseObjectGroup", {
      objectGroup: session.group,
    }).catch(() => {});
    session.handles.clear();
    session.group = "sugarcube-inspector:" + crypto.randomUUID();
    session.id = crypto.randomUUID();
    this.modeChanged(tabId);
    return this.getMode(tabId);
  }

  async inspect(tabId: number, target: Target, offset: number): Promise<Inspection> {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error("Debugger disconnected. MAIN-world inspection is available.");

    let objectId: string;
    if (target.kind === "path") {
      if (target.path.segments.length) {
        throw new Error("An old MAIN-world path cannot be used in debugger mode.");
      }
      const expression = target.path.root === "story"
        ? "globalThis.SugarCube?.State?.variables"
        : "globalThis.SugarCube?.State?.temporary";
      const evaluated = await this.command<Evaluation>(tabId, "Runtime.evaluate", {
        expression,
        objectGroup: session.group,
        silent: true,
        returnByValue: false,
      });
      if (evaluated.exceptionDetails || !evaluated.result.objectId) {
        throw new Error("The requested SugarCube store is unavailable.");
      }
      objectId = evaluated.result.objectId;
      session.handles.add(objectId);
    } else {
      if (target.sessionId !== session.id ||
          !session.handles.has(target.objectId)) {
        throw new Error("Remote object handle expired; refresh the drawer.");
      }
      objectId = target.objectId;
    }

    const data = await this.command<PropertyReply>(tabId, "Runtime.getProperties", {
      objectId,
      ownProperties: true,
      generatePreview: false,
    });
    if (data.exceptionDetails) {
      throw new Error(data.exceptionDetails.text ?? "Property inspection failed.");
    }
    const groups = [
      ["own", data.result],
      ["private", data.privateProperties ?? []],
      ["internal", data.internalProperties ?? []],
    ] as const;
    const entries: Entry[] = [];
    for (const [category, descriptors] of groups) {
      for (const property of descriptors) {
        const getter = property.get !== undefined;
        const setter = property.set !== undefined;
        const accessor = getter || setter;
        const value = property.value;
        const handle = !accessor ? value?.objectId : undefined;
        if (handle) session.handles.add(handle);
        entries.push({
          name: property.name,
          preview: accessor
            ? getter && setter ? "[Getter/Setter]" : getter ? "[Getter]" : "[Setter]"
            : describe(value),
          expandable: Boolean(handle),
          ...(handle && { target: { kind: "remote", sessionId: session.id, objectId: handle } as const }),
          nonEnumerable: property.enumerable === false,
          category,
        });
      }
    }
    return { entries: entries.slice(offset, offset + PAGE_SIZE), total: entries.length, offset };
  }
}
