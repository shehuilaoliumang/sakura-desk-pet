/** Shown on the pet when the local API stays unreachable. */
export const POLL_ERROR = "桌宠接口没有应答";

/** A cancelled poll is not the user closing the app. Window resizes do this on Windows. */
export function isPollAbort(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return (error as { name: unknown }).name === "AbortError";
}

/**
 * The pet already on screen should survive one dropped poll.
 * Boot, with nothing drawn yet, still reports the first failure.
 */
export function pollErrorMessage(hasPicture: boolean, failures: number, aborted: boolean): string | null {
  if (aborted || failures < 1) return null;
  if (hasPicture && failures < 2) return null;
  return POLL_ERROR;
}
