import type { InspectorData, InspectorReply, InspectorRequest } from "../debugger/protocol";

export async function debuggerRequest(request: InspectorRequest): Promise<InspectorData> {
  const response = await chrome.runtime.sendMessage(request) as InspectorReply;
  if (!response?.ok) throw new Error(response?.error ?? "Debugger background service did not respond.");
  return response.data;
}
