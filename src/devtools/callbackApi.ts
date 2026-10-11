/**
 * Chrome DevTools APIs became promise-capable in Chrome 151/152.
 * Their callback forms also work on earlier versions.
 */
export function callbackResult<T>(
  invoke: (callback: (value: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve) => invoke(resolve));
}

export function callbackDone(
  invoke: (callback: () => void) => void,
): Promise<void> {
  return new Promise<void>((resolve) => invoke(resolve));
}

export function evaluateWithCallback(
  invoke: (callback: (result: unknown, exceptionInfo?: unknown) => void) => void,
): Promise<unknown> {
  return new Promise((resolve) => {
    invoke((result, exceptionInfo) => {
      resolve(exceptionInfo == null ? result : [result, exceptionInfo]);
    });
  });
}

/**
 * DevTools extension pages do not support returning promises from onMessage
 * listeners. Use sendResponse and return the literal true.
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
