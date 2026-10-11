const expression = "Boolean(globalThis.SugarCube && globalThis.SugarCube.State)";

/**
 * WXT's browser export uses Chrome's native promise API in Chromium.
 * That API resolves directly to the evaluated value; some WebExtension
 * implementations instead resolve to [value, exceptionInfo].
 */
export async function detectSugarCube(
  evaluate: (expression: string) => Promise<unknown>,
): Promise<boolean> {
  const response = await evaluate(expression);

  if (typeof response === "boolean") return response;

  if (Array.isArray(response) && response.length === 2) {
    const [result, exceptionInfo] = response as [unknown, unknown];
    if (exceptionInfo != null) {
      const details = typeof exceptionInfo === "object" && exceptionInfo !== null
        ? exceptionInfo as { value?: unknown; code?: unknown }
        : null;
      const reason = details?.value ?? details?.code;
      throw new Error(reason == null
        ? "DevTools evaluation failed."
        : `DevTools evaluation failed: ${String(reason)}`);
    }
    if (typeof result === "boolean") return result;
  }

  throw new TypeError("Unexpected DevTools evaluation response.");
}
