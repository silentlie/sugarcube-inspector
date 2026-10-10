import "./App.css";

import { useCallback, useEffect, useState } from "react";
import { readDetection, type DetectionState } from "@/src/sidepanel/readDetection";

export default function App() {
  const [detection, setDetection] = useState<DetectionState>({
    status: "checking",
  });

  const readSugarCube = useCallback(() => {
    void readDetection().then(setDetection, (error: unknown) => {
      setDetection({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  function detectSugarCube() {
    setDetection({ status: "checking" });
    void readSugarCube();
  }

  useEffect(() => {
    void readSugarCube();
  }, [readSugarCube]);

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

      <button type="button" onClick={detectSugarCube}>
        Refresh
      </button>
    </main>
  );
}
