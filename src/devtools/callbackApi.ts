/**
 * DevTools extension pages must use sendResponse rather than returning a
 * promise from a runtime.onMessage listener.
 */
export function createRefreshMessageHandler(
  tabId: number,
  refresh: () => Promise<void>,
) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    if (typeof message !== "object" || message === null) return false;
    const request = message as Record<string, unknown>;
    if (request.type !== "sugarcube:refresh" || request.tabId !== tabId) return false;

    void refresh().then(
      () => sendResponse({ ok: true }),
      (error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return true;
  };
}
