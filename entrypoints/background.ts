import { DebuggerService } from "@/src/debugger/DebuggerService";
import { isInspectorRequest, type InspectorReply } from "@/src/debugger/protocol";

export default defineBackground(() => {
  const inspector = new DebuggerService();

  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (!isInspectorRequest(message)) return false;
    void inspector.handle(message).then(
      (data) => {
        const result: InspectorReply = { ok: true, data };
        respond(result);
      },
      (error: unknown) => {
        const result: InspectorReply = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
        respond(result);
      },
    );
    return true;
  });

  void browser.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  }).catch(console.error);
});
