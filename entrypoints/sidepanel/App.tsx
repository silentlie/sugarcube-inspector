import "./App.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InspectorRequest, InspectorSession, InspectorSessionEnded, RemoteProperty } from "@/src/debugger/protocol";
import { debuggerRequest } from "@/src/sidepanel/debuggerClient";
import { RemoteObjectTree } from "@/src/sidepanel/RemoteObjectTree";

type ActiveTab = { id: number; title: string; url: string };

export default function App() {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [session, setSession] = useState<InspectorSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const currentTab = useRef<number | null>(null);

  const checkTab = useCallback(async () => {
    const request = ++requestNumber.current;
    setChecking(true);
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (request !== requestNumber.current) return;
      const nextTab = active?.id === undefined ? null : {
        id: active.id,
        title: active.title ?? "Untitled tab",
        url: active.url ?? "",
      };
      setTab(nextTab);
      currentTab.current = nextTab?.id ?? null;
      setSession(null);
      if (nextTab?.url.startsWith("file://")) {
        const state = await debuggerRequest({ type: "inspector:status", tabId: nextTab.id });
        if (request !== requestNumber.current) return;
        if (state.status === "connected") setSession(state);
      }
      if (request === requestNumber.current) setNotice(null);
    } catch (error) {
      if (request === requestNumber.current) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (request === requestNumber.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkTab();
    const activated = () => { void checkTab(); };
    const updated = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (tabId === currentTab.current && info.status === "complete") void checkTab();
    };
    const ended = (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const event = message as Partial<InspectorSessionEnded>;
      if (event.type !== "inspector:sessionEnded" || event.tabId !== currentTab.current) return;
      setSession(null);
      setNotice(event.reason ?? "Debugger disconnected.");
    };
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.runtime.onMessage.addListener(ended);
    return () => {
      requestNumber.current++;
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.runtime.onMessage.removeListener(ended);
    };
  }, [checkTab]);

  const run = async (action: "connect" | "disconnect" | "refresh") => {
    if (!tab || busy) return;
    setBusy(action);
    setNotice(null);
    try {
      const request: InspectorRequest = action === "refresh"
        ? { type: "inspector:refresh", tabId: tab.id, sessionId: session!.sessionId }
        : action === "connect"
          ? { type: "inspector:connect", tabId: tab.id }
          : { type: "inspector:disconnect", tabId: tab.id };
      const result = await debuggerRequest(request);
      if (currentTab.current !== tab.id) return;
      setSession(result.status === "connected" ? result : null);
      if (action === "disconnect") {
        setNotice("Disconnected. You can now open Chrome DevTools. Close DevTools before reconnecting.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      // Re-read the service state; a failed refresh doesn't necessarily detach.
      try {
        const state = await debuggerRequest({ type: "inspector:status", tabId: tab.id });
        if (currentTab.current === tab.id) setSession(state.status === "connected" ? state : null);
      } catch {
        if (currentTab.current === tab.id) setSession(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const inspect = useCallback(async (objectId: string): Promise<RemoteProperty[]> => {
    if (!session) throw new Error("Not connected.");
    const result = await debuggerRequest({
      type: "inspector:properties",
      tabId: session.tabId,
      sessionId: session.sessionId,
      objectId,
    });
    if (result.status !== "properties") throw new Error("Unexpected debugger response.");
    return result.properties;
  }, [session]);

  const eligible = tab?.url.startsWith("file://") ?? false;

  return (
    <main className="inspector-panel">
      <header className="inspector-header">
        <h1>SugarCube Inspector</h1>
        <span className="inspector-caption">Chrome debugger proof of concept</span>
      </header>

      {checking ? <p>Checking current tab…</p> : (
        <>
          <p className="inspector-target">
            <strong>Tab:</strong> {tab?.title ?? "No active tab"}
          </p>
          {!eligible && (
            <p className="inspector-warning">
              Select a local SugarCube HTML tab. Enable <strong>Allow access to file URLs</strong> in
              the extension's details if Chrome cannot read the file.
            </p>
          )}
          <div className="inspector-toolbar">
            <span className={session ? "inspector-connected" : "inspector-disconnected"}>
              {session ? "Connected" : "Disconnected"}
            </span>
            {session ? (
              <>
                <button type="button" disabled={busy !== null} onClick={() => { void run("refresh"); }}>
                  Refresh variables
                </button>
                <button type="button" disabled={busy !== null} onClick={() => { void run("disconnect"); }}>
                  Disconnect
                </button>
              </>
            ) : (
              <button type="button" disabled={!eligible || busy !== null}
                onClick={() => { void run("connect"); }}>
                Connect
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => { void checkTab(); }}>
              Check tab
            </button>
          </div>
          {busy && <p className="inspector-caption">{busy === "connect" ? "Attaching debugger…" : `${busy}…`}</p>}
          {notice && <p role="status" className="inspector-warning">{notice}</p>}
          {session ? (
            <section aria-label="Live SugarCube variables">
              <h2>Live variables</h2>
              <p className="inspector-caption">Expand to fetch properties directly from Chrome. Accessors are not invoked by expansion.</p>
              <RemoteObjectTree
                key={`${session.sessionId}:${session.revision}`}
                items={session.roots}
                inspect={inspect}
              />
            </section>
          ) : (
            <p className="inspector-caption">
              Connect to inspect live objects. Disconnect before opening DevTools;
              reconnect after closing it. Existing remote handles are never reused.
            </p>
          )}
        </>
      )}
    </main>
  );
}
