export const EXTENSION_DISPLAY_NAME = "AnalyseMe";
export const EXTENSION_STATUS_KEY = "analyseme";
export const ANALYSEME_COMMAND = "analyseme";

export const ANALYSEME_TOOL_NAMES = {
  getProjectSummary: "analyseme_get_project_summary",
  listIssues: "analyseme_list_issues",
  getIssue: "analyseme_get_issue",
  listSecurityHotspots: "analyseme_list_security_hotspots",
  getSecurityHotspot: "analyseme_get_security_hotspot",
} as const;

export const SONAR_ENV_VARS = {
  url: "SONARQUBE_URL",
  token: "SONARQUBE_TOKEN",
  organization: "SONARQUBE_ORGANIZATION",
  projectKey: "SONARQUBE_PROJECT_KEY",
  branch: "SONARQUBE_BRANCH",
  pullRequest: "SONARQUBE_PULL_REQUEST",
} as const;

export const SONAR_ALLOW_INSECURE_HTTP_ENV_VAR = "SONARQUBE_ALLOW_INSECURE_HTTP";

export const SONAR_ENV_VAR_NAMES = [
  SONAR_ENV_VARS.url,
  SONAR_ENV_VARS.token,
  SONAR_ENV_VARS.organization,
  SONAR_ENV_VARS.projectKey,
  SONAR_ENV_VARS.branch,
  SONAR_ENV_VARS.pullRequest,
] as const;

export const DEFAULT_ENV_FILE_NAME = ".env";
export const SONAR_PROJECT_PROPERTIES_FILE = "sonar-project.properties";
