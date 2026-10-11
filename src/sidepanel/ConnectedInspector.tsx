import { useCallback } from "react";
import type { InspectorSession, RemoteProperty } from "../debugger/protocol";
import { debuggerRequest } from "./debuggerClient";
import { RemoteObjectTree } from "./RemoteObjectTree";

/** The inspector tree exists only for a confirmed, connected CDP session. */
export function ConnectedInspector({ session }: { session: InspectorSession }) {
  const inspect = useCallback(async (objectId: string): Promise<RemoteProperty[]> => {
    const result = await debuggerRequest({
      type: "inspector:properties",
      tabId: session.tabId,
      sessionId: session.sessionId,
      objectId,
    });
    if (result.status !== "properties") throw new Error("Unexpected debugger response.");
    return result.properties;
  }, [session]);

  return (
    <section aria-label="Live SugarCube variables">
      <h2>Live variables</h2>
      <p className="inspector-caption">
        Expand to fetch properties directly from Chrome. Accessors are not invoked by expansion.
      </p>
      <RemoteObjectTree items={session.roots} inspect={inspect} />
    </section>
  );
}
