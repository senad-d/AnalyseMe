import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerProjectSummaryTool } from "./tools/project-summary.ts";

/**
 * AnalyseMe extension entry point.
 *
 * Runtime status: Pi surfaces are intentionally registered only after each
 * command/tool feature is implemented and tested. Keep this file small: import
 * feature modules and call their register* functions here only when they are
 * ready.
 */
export default function analyseMeExtension(pi: ExtensionAPI) {
  registerProjectSummaryTool(pi);

  // Planned, not registered here yet:
  // - /analyseme read-only config TUI and /analyseme help
  // - analyseme_list_issues
  // - analyseme_get_issue
  // - analyseme_list_security_hotspots
  // - analyseme_get_security_hotspot
}
