import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * AnalyseMe extension entry point.
 *
 * Preparation status: feature implementation is intentionally pending. Keep this
 * file small in the implementation session: import feature modules and call
 * their register* functions here only after each feature is implemented and
 * tested.
 */
export default function analyseMeExtension(_pi: ExtensionAPI) {
  // Intentionally inert during project preparation.
  // Planned, not implemented here:
  // - /analyseme read-only config TUI and /analyseme help
  // - analyseme_get_project_summary
  // - analyseme_list_issues
  // - analyseme_get_issue
  // - analyseme_list_security_hotspots
  // - analyseme_get_security_hotspot
}
