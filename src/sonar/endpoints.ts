import { AnalyseMeConfigError } from "../config/types.ts";

export type EndpointQueryValue = string | number | boolean | undefined;

export interface EndpointRequest {
  path: string;
  query: Record<string, EndpointQueryValue>;
}

export interface ProjectScopedEndpointOptions {
  projectKey: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface PagedEndpointOptions extends ProjectScopedEndpointOptions {
  page?: number;
  pageSize?: number;
}

export interface IssueDetailEndpointOptions {
  issueKey: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface RuleDetailEndpointOptions {
  ruleKey: string;
  organization?: string;
}

export interface SourceIssueSnippetsEndpointOptions {
  issueKey: string;
  organization?: string;
}

export interface SourceShowEndpointOptions {
  componentKey: string;
  from?: number;
  to?: number;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface HotspotDetailEndpointOptions {
  hotspotKey: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export const SONAR_ENDPOINTS = {
  projectStatus: "/api/qualitygates/project_status",
  componentMeasures: "/api/measures/component",
  issueSearch: "/api/issues/search",
  ruleShow: "/api/rules/show",
  sourceIssueSnippets: "/api/sources/issue_snippets",
  sourceShow: "/api/sources/show",
  hotspotSearch: "/api/hotspots/search",
  hotspotShow: "/api/hotspots/show",
} as const;

export const DEFAULT_SONAR_PAGE_SIZE = 100;

export const PROJECT_SUMMARY_METRICS = [
  "bugs",
  "vulnerabilities",
  "code_smells",
  "security_hotspots",
  "coverage",
  "duplicated_lines_density",
  "reliability_rating",
  "security_rating",
  "sqale_rating",
  "alert_status",
  "ncloc",
] as const;

export function buildProjectStatusEndpoint(options: ProjectScopedEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.projectStatus,
    query: withOptionalScope({ projectKey: options.projectKey }, options),
  };
}

export function buildComponentMeasuresEndpoint(
  options: ProjectScopedEndpointOptions,
  metricKeys: readonly string[] = PROJECT_SUMMARY_METRICS,
): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.componentMeasures,
    query: withOptionalScope({ component: options.projectKey, metricKeys: metricKeys.join(",") }, options),
  };
}

export function buildIssueSearchEndpoint(options: PagedEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.issueSearch,
    query: withOptionalScope(
      {
        componentKeys: options.projectKey,
        resolved: false,
        p: options.page ?? 1,
        ps: options.pageSize ?? DEFAULT_SONAR_PAGE_SIZE,
      },
      options,
    ),
  };
}

export function buildIssueDetailEndpoint(options: IssueDetailEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.issueSearch,
    query: withOptionalScope({ issues: options.issueKey, additionalFields: "_all" }, options),
  };
}

export function buildRuleDetailEndpoint(options: RuleDetailEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.ruleShow,
    query: withOptionalOrganization({ key: options.ruleKey }, options.organization),
  };
}

export function buildSourceIssueSnippetsEndpoint(options: SourceIssueSnippetsEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.sourceIssueSnippets,
    query: withOptionalOrganization({ issueKey: options.issueKey }, options.organization),
  };
}

export function buildSourceShowEndpoint(options: SourceShowEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.sourceShow,
    query: withOptionalScope(
      {
        key: options.componentKey,
        from: options.from,
        to: options.to,
      },
      options,
    ),
  };
}

export function buildHotspotSearchEndpoint(options: PagedEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.hotspotSearch,
    query: withOptionalScope(
      {
        projectKey: options.projectKey,
        status: "TO_REVIEW",
        p: options.page ?? 1,
        ps: options.pageSize ?? DEFAULT_SONAR_PAGE_SIZE,
      },
      options,
    ),
  };
}

export function buildHotspotDetailEndpoint(options: HotspotDetailEndpointOptions): EndpointRequest {
  return {
    path: SONAR_ENDPOINTS.hotspotShow,
    query: withOptionalScope({ hotspot: options.hotspotKey }, options),
  };
}

export function withOptionalScope(
  query: Record<string, EndpointQueryValue>,
  options: Pick<ProjectScopedEndpointOptions, "organization" | "branch" | "pullRequest">,
): Record<string, EndpointQueryValue> {
  assertExclusiveEndpointScope(options.branch, options.pullRequest);

  return {
    ...query,
    organization: options.organization,
    branch: options.branch,
    pullRequest: options.pullRequest,
  };
}

export function withOptionalOrganization(
  query: Record<string, EndpointQueryValue>,
  organization: string | undefined,
): Record<string, EndpointQueryValue> {
  return { ...query, organization };
}

function assertExclusiveEndpointScope(branch: string | undefined, pullRequest: string | undefined): void {
  if (!branch || !pullRequest) return;

  throw new AnalyseMeConfigError(["Sonar endpoint options cannot include both branch and pullRequest."]);
}
