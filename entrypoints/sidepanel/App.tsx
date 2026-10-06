import "./App.css";

import { useEffect, useState } from "react";

type DetectionState =
  | { status: "checking" }
  | { status: "not-local" }
  | { status: "not-detected" }
  | {
      status: "detected";
      storyName?: string;
      ifid?: string;
      passage?: string;
    }
  | {
      status: "error";
      message: string;
    };

function App() {
  const [detection, setDetection] = useState<DetectionState>({
    status: "checking",
  });

  async function detectSugarCube() {
    setDetection({
      status: "checking",
    });

    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || tab.id == null) {
        setDetection({
          status: "error",
          message: "No active tab found.",
        });

        return;
      }

      if (!tab.url?.startsWith("file://")) {
        setDetection({
          status: "not-local",
        });

        return;
      }

      const [result] = await browser.scripting.executeScript({
        target: {
          tabId: tab.id,
        },

        world: "MAIN",

        func: () => {
          const page = globalThis as any;

          const sc = page.SugarCube;

          if (!sc?.State) {
            return {
              detected: false,
            };
          }

          const storyData = document.querySelector("tw-storydata");

          return {
            detected: true,

            version:
              sc.version?.toString?.() ??
              storyData?.getAttribute("format-version") ??
              "",

            storyName:
              sc.Story?.name ??
              sc.Story?.title ??
              storyData?.getAttribute("name") ??
              document.title,

            ifid: sc.Story?.ifId ?? storyData?.getAttribute("ifid") ?? "",

            passage: sc.State?.passage ?? "",

            variableCount: Object.keys(sc.State?.variables ?? {}).length,
          };
        },
      });

      const info = result?.result;

      if (!info?.detected) {
        setDetection({
          status: "not-detected",
        });

        return;
      }

      setDetection({
        status: "detected",
        storyName: info.storyName,
        ifid: info.ifid,
        passage: info.passage,
      });
    } catch (error) {
      setDetection({
        status: "error",

        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    detectSugarCube();
  }, []);

  return (
    <main>
      <h1>SugarCube Inspector</h1>

      {detection.status === "checking" && <p>Checking current page...</p>}

      {detection.status === "not-local" && (
        <p>Open a local HTML file to use the inspector.</p>
      )}

      {detection.status === "not-detected" && <p>❌ SugarCube not detected</p>}

      {detection.status === "detected" && (
        <>
          <p>✅ SugarCube detected</p>

          <dl>
            <dt>Story</dt>
            <dd>{detection.storyName || "Unknown"}</dd>

            <dt>Passage</dt>
            <dd>{detection.passage || "Unknown"}</dd>

            {detection.ifid && (
              <>
                <dt>IFID</dt>
                <dd>{detection.ifid}</dd>
              </>
            )}
          </dl>
        </>
      )}

      {detection.status === "error" && (
        <>
          <p>⚠️ Unable to inspect page</p>
          <pre>{detection.message}</pre>
        </>
      )}

      <button onClick={detectSugarCube}>Refresh</button>
    </main>
  );
}

export default App;
