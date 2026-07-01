import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { EXTENSION_STATUS_KEY } from "../constants.ts";

export function registerAnalyseMeLifecycle(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    setAnalyseMeStatus(ctx, "AnalyseMe loaded");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    setAnalyseMeStatus(ctx, undefined);
  });
}

function setAnalyseMeStatus(ctx: ExtensionContext, value: string | undefined): void {
  if (!ctx.hasUI) return;

  ctx.ui.setStatus(EXTENSION_STATUS_KEY, value);
}
