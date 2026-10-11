import "./App.css";
import { useCallback, useEffect, useState } from "react";
import { onMessage, sendMessage } from "@/src/inspection/messaging";
import type { InspectorMode } from "@/src/inspection/protocol";

type View = {
  tabId?: number;
  title?: string;
  local: boolean;
  mode: InspectorMode;
};

export default function App() {
  const [view, setView] = useState<View>({ local: false, mode: { mode: "main" } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setView({ local: false, mode: { mode: "main" } });
      return;
    }
    const local = tab.url?.startsWith("file://") ?? false;
    const mode = local
      ? await sendMessage("inspector:status", { tabId: tab.id })
      : { mode: "main" as const };
    setView({ tabId: tab.id, title: tab.title, local, mode });
  }, []);

  useEffect(() => {
    let active = true;
    const check = () => {
      void refresh().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    };
    // Keep initial async work outside the synchronous effect render.
    void Promise.resolve().then(check);
    const removeModeListener = onMessage("inspector:mode", ({ data }) => {
      setView((current) => current.tabId === data.tabId
        ? { ...current, mode: data.mode } : current);
    });
    browser.tabs.onActivated.addListener(check);
    return () => {
      active = false;
      removeModeListener();
      browser.tabs.onActivated.removeListener(check);
    };
  }, [refresh]);

  async function switchMode() {
    if (!view.tabId || busy) return;
    const tabId = view.tabId;
    const connecting = view.mode.mode === "main";
    setBusy(true);
    setError(null);
    try {
      const mode = connecting
        ? await sendMessage("inspector:connect", { tabId })
        : await sendMessage("inspector:disconnect", { tabId });
      setView((current) => current.tabId === tabId ? { ...current, mode } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>SugarCube Inspector</h1>
      <p>The variable drawer stays on the right edge of the game page in both modes.</p>
      {view.title && <p><strong>Tab:</strong> {view.title}</p>}
      {!view.local ? (
        <p>Open a local SugarCube HTML game to use the inspector.</p>
      ) : (
        <>
          <p><strong>Inspection backend:</strong> {
            view.mode.mode === "cdp" ? "Chrome debugger (CDP)" : "MAIN-world JavaScript"
          }</p>
          <button type="button" disabled={busy} onClick={() => { void switchMode(); }}>
            {busy ? "Switching..." : view.mode.mode === "main"
              ? "Connect debugger" : "Disconnect debugger"}
          </button>
          <p className="notice">
            Debugger mode uses Chrome's debugging permission and displays a Chrome
            security banner. Closing that banner disconnects the session and
            returns the drawer to MAIN-world inspection.
          </p>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" className="secondary" onClick={() => {
        void refresh().catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
      }}>Refresh status</button>
    </main>
  );
}
