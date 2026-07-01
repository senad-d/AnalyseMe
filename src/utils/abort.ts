export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;

  if (signal.reason instanceof Error) throw signal.reason;

  throw createAbortError(typeof signal.reason === "string" ? signal.reason : "The operation was aborted.");
}

export function rethrowIfAbortError(error: unknown, signal: AbortSignal | undefined): void {
  if (!isAbortError(error, signal)) return;
  if (error instanceof Error && error.name === "AbortError") throw error;

  throwIfAborted(signal);
  throw createAbortError();
}

export function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  if (!(error instanceof Error)) return false;

  return error.name === "AbortError";
}

function createAbortError(message = "The operation was aborted."): Error {
  const error = new Error(message);
  error.name = "AbortError";

  return error;
}
