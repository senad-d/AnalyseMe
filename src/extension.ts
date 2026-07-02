import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAnalyseMeCommand } from "./commands/analyseme.ts";
import { registerAnalyseMeLifecycle } from "./events/lifecycle.ts";
import { registerGetIssueTool } from "./tools/get-issue.ts";
import { registerGetSecurityHotspotTool } from "./tools/get-security-hotspot.ts";
import { registerListIssuesTool } from "./tools/list-issues.ts";
import { registerListSecurityHotspotsTool } from "./tools/list-security-hotspots.ts";
import { registerProjectSummaryTool } from "./tools/project-summary.ts";

/**
 * AnalyseMe extension entry point.
 *
 * Runtime status: the read-only command, five Sonar tools, and lightweight
 * lifecycle cleanup hooks are implemented and registered here. Keep this file
 * small: import feature modules and call their register* functions here after
 * the feature is implemented and tested.
 */
export default function analyseMeExtension(pi: ExtensionAPI) {
  registerProjectSummaryTool(pi);
  registerListIssuesTool(pi);
  registerGetIssueTool(pi);
  registerListSecurityHotspotsTool(pi);
  registerGetSecurityHotspotTool(pi);
  registerAnalyseMeCommand(pi);
  registerAnalyseMeLifecycle(pi);
}
