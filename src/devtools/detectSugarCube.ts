const expression = "Boolean(globalThis.SugarCube && globalThis.SugarCube.State)";

function exceptionMessage(exceptionInfo: unknown): string {
  if (typeof exceptionInfo === "object" && exceptionInfo !== null) {
    const info = exceptionInfo as { value?: unknown; code?: unknown; description?: unknown };
    const detail = info.value ?? info.description ?? info.code;
    if (detail != null) return `DevTools evaluation failed: ${String(detail)}`;
  }
  return "DevTools evaluation failed.";
}

/** Understand both legacy callback results and Chrome 151+ result objects. */
export async function detectSugarCube(
  evaluate: (expression: string) => Promise<unknown>,
): Promise<boolean> {
  const response = await evaluate(expression);

  if (typeof response === "boolean") return response;

  if (Array.isArray(response) && response.length === 2) {
    const [result, exceptionInfo] = response;
    if (exceptionInfo != null) throw new Error(exceptionMessage(exceptionInfo));
    if (typeof result === "boolean") return result;
  }

  if (typeof response === "object" && response !== null && "result" in response) {
    const result = response as { result: unknown; exceptionInfo?: unknown };
    if (result.exceptionInfo != null) {
      throw new Error(exceptionMessage(result.exceptionInfo));
    }
    if (typeof result.result === "boolean") return result.result;
  }

  throw new TypeError("Unexpected DevTools evaluation response.");
}
