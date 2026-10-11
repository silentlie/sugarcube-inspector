import { browser as chrome } from "wxt/browser";
import type {
  InspectorData,
  InspectorDisconnected,
  InspectorRequest,
  InspectorSession,
  InspectorSessionEnded,
  RemoteProperty,
  RemoteValue,
} from "./protocol";

type Evaluation = {
  result: RemoteValue;
  exceptionDetails?: { text?: string };
};

type PropertyDescriptor = {
  name: string;
  value?: RemoteValue;
  get?: RemoteValue;
  set?: RemoteValue;
  enumerable?: boolean;
  writable?: boolean;
  configurable?: boolean;
};

type PropertiesResult = {
  result: PropertyDescriptor[];
  internalProperties?: Array<{ name: string; value?: RemoteValue }>;
  privateProperties?: Array<{ name: string; value?: RemoteValue; get?: RemoteValue; set?: RemoteValue }>;
  exceptionDetails?: { text?: string };
};

type Session = {
  tabId: number;
  sessionId: string;
  revision: number;
  objectGroup: string;
  roots: RemoteProperty[];
};

const ROOT_EXPRESSIONS = [
  { name: "story", expression: "typeof SugarCube !== 'undefined' && SugarCube.State ? SugarCube.State.variables : undefined" },
  { name: "temporary", expression: "typeof SugarCube !== 'undefined' && SugarCube.State ? SugarCube.State.temporary : undefined" },
] as const;

/** Remote object descriptions are JSON-compatible; raw page objects never cross messaging. */
function remote(value: RemoteValue | undefined): RemoteValue | undefined {
  if (!value) return undefined;
  return {
    type: value.type,
    subtype: value.subtype,
    className: value.className,
    description: value.description,
    objectId: value.objectId,
    value: value.value,
    unserializableValue: value.unserializableValue,
  };
}

function propertiesOf(result: PropertiesResult): RemoteProperty[] {
  return [
    ...result.result.map((property): RemoteProperty => ({
      name: property.name,
      kind: "own",
      value: remote(property.value),
      getter: property.get !== undefined,
      setter: property.set !== undefined,
      enumerable: property.enumerable,
      writable: property.writable,
      configurable: property.configurable,
    })),
    ...(result.privateProperties ?? []).map((property): RemoteProperty => ({
      name: property.name,
      kind: "private",
      value: remote(property.value),
      getter: property.get !== undefined,
      setter: property.set !== undefined,
    })),
    ...(result.internalProperties ?? []).map((property): RemoteProperty => ({
      name: property.name,
      kind: "internal",
      value: remote(property.value),
    })),
  ];
}

/** Owns CDP attachments and opaque remote object handles, scoped to a tab. */
export class DebuggerService {
  private readonly sessions = new Map<number, Session>();
  private readonly connecting = new Map<number, Promise<InspectorSession>>();

  constructor() {
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined || !this.sessions.delete(source.tabId)) return;
      this.announce(source.tabId, reason === "target_closed"
        ? "The inspected tab was closed."
        : "Chrome DevTools opened or debugging was cancelled. Close DevTools before reconnecting.");
    });
    chrome.debugger.onEvent.addListener((source, method) => {
      if (source.tabId === undefined || method !== "Runtime.executionContextsCleared") return;
      if (!this.sessions.delete(source.tabId)) return;
      this.announce(source.tabId, "The page navigated. Reconnect to inspect its new state.");
      void chrome.debugger.detach({ tabId: source.tabId }).catch(() => {});
    });
  }

  private announce(tabId: number, reason: string): void {
    const notification: InspectorSessionEnded = {
      type: "inspector:sessionEnded", tabId, reason,
    };
    void chrome.runtime.sendMessage(notification).catch(() => {});
  }

  private async command<T>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T> {
    return await chrome.debugger.sendCommand({ tabId }, method, params) as T;
  }

  private view(session: Session): InspectorSession {
    return {
      status: "connected",
      tabId: session.tabId,
      sessionId: session.sessionId,
      revision: session.revision,
      roots: session.roots,
    };
  }

  private async loadRoots(tabId: number, objectGroup: string): Promise<RemoteProperty[]> {
    const roots: RemoteProperty[] = [];
    for (const root of ROOT_EXPRESSIONS) {
      const evaluated = await this.command<Evaluation>(tabId, "Runtime.evaluate", {
        expression: root.expression,
        objectGroup,
        returnByValue: false,
        silent: true,
      });
      if (evaluated.exceptionDetails || !evaluated.result.objectId) {
        throw new Error("SugarCube is not ready on this tab, or the variable stores are unavailable.");
      }
      roots.push({ name: root.name, kind: "own", value: remote(evaluated.result) });
    }
    return roots;
  }

  status(tabId: number): InspectorSession | InspectorDisconnected {
    const session = this.sessions.get(tabId);
    return session ? this.view(session) : { status: "disconnected", tabId };
  }

  connect(tabId: number): Promise<InspectorSession> {
    const existing = this.sessions.get(tabId);
    if (existing) return Promise.resolve(this.view(existing));
    const pending = this.connecting.get(tabId);
    if (pending) return pending;

    const attempt = this.connectNew(tabId).finally(() => this.connecting.delete(tabId));
    this.connecting.set(tabId, attempt);
    return attempt;
  }

  private async connectNew(tabId: number): Promise<InspectorSession> {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith("file://")) {
      throw new Error("Select a local SugarCube HTML tab and enable extension access to file URLs.");
    }

    await chrome.debugger.attach({ tabId }, "1.3");
    const objectGroup = `sugarcube-inspector:${crypto.randomUUID()}`;
    try {
      await this.command(tabId, "Runtime.enable");
      const roots = await this.loadRoots(tabId, objectGroup);
      const session: Session = {
        tabId, sessionId: crypto.randomUUID(), revision: 0, objectGroup, roots,
      };
      this.sessions.set(tabId, session);
      return this.view(session);
    } catch (error) {
      await chrome.debugger.detach({ tabId }).catch(() => {});
      throw error;
    }
  }

  async disconnect(tabId: number): Promise<InspectorDisconnected> {
    const pending = this.connecting.get(tabId);
    if (pending) await pending.catch(() => {});
    const session = this.sessions.get(tabId);
    if (session) {
      this.sessions.delete(tabId);
      await this.command(tabId, "Runtime.releaseObjectGroup", {
        objectGroup: session.objectGroup,
      }).catch(() => {});
      await chrome.debugger.detach({ tabId }).catch(() => {});
    }
    this.announce(tabId, "Inspection disconnected.");
    return { status: "disconnected", tabId };
  }

  private requireSession(tabId: number, sessionId: string): Session {
    const session = this.sessions.get(tabId);
    if (!session || session.sessionId !== sessionId) {
      throw new Error("Inspection session expired. Reconnect to obtain fresh object handles.");
    }
    return session;
  }

  async refresh(tabId: number, sessionId: string): Promise<InspectorSession> {
    const session = this.requireSession(tabId, sessionId);
    const newGroup = `sugarcube-inspector:${crypto.randomUUID()}`;
    const roots = await this.loadRoots(tabId, newGroup);
    const oldGroup = session.objectGroup;
    session.objectGroup = newGroup;
    session.roots = roots;
    session.revision++;
    await this.command(tabId, "Runtime.releaseObjectGroup", {
      objectGroup: oldGroup,
    }).catch(() => {});
    return this.view(session);
  }

  async properties(tabId: number, sessionId: string, objectId: string): Promise<InspectorData> {
    this.requireSession(tabId, sessionId);
    const result = await this.command<PropertiesResult>(tabId, "Runtime.getProperties", {
      objectId, ownProperties: true, generatePreview: false,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Property inspection failed.");
    }
    return { status: "properties", properties: propertiesOf(result) };
  }

  async handle(request: InspectorRequest): Promise<InspectorData> {
    switch (request.type) {
      case "inspector:status": return this.status(request.tabId);
      case "inspector:connect": return this.connect(request.tabId);
      case "inspector:disconnect": return this.disconnect(request.tabId);
      case "inspector:refresh": return this.refresh(request.tabId, request.sessionId);
      case "inspector:properties":
        return this.properties(request.tabId, request.sessionId, request.objectId);
    }
  }
}
