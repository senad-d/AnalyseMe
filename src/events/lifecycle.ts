import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { EXTENSION_STATUS_KEY } from "../constants.ts";

export function registerAnalyseMeLifecycle(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    clearAnalyseMeStatus(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearAnalyseMeStatus(ctx);
  });
}

function clearAnalyseMeStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  ctx.ui.setStatus(EXTENSION_STATUS_KEY, undefined);
}
