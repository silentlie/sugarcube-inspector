import { isError } from "@sindresorhus/is";

export function errorMessage(cause: unknown): string {
  return isError(cause) ? cause.message : String(cause);
}
