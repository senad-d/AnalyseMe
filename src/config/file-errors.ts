const MAX_DISPLAY_PATH_LENGTH = 48;

export function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function localFileReadWarning(label: string, path: string, error: unknown): string {
  const reason = fileErrorReason(error);
  const displayPath = clippedPath(path);
  return `readable file, not a directory. Unable to read ${label} (${reason}; ${displayPath}).`;
}

function fileErrorReason(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  if (error instanceof Error) return error.message;

  return String(error);
}

function clippedPath(path: string): string {
  if (path.length <= MAX_DISPLAY_PATH_LENGTH) return path;

  return `…${path.slice(-(MAX_DISPLAY_PATH_LENGTH - 1))}`;
}
