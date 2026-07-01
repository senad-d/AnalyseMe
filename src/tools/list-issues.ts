import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { buildIssueSearchEndpoint } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { AgentIssueSummary, SonarIssueLike } from "../sonar/issue-mapping.ts";
import { isActiveSonarIssue, mapIssueSummary } from "../sonar/issue-mapping.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { normalizePositiveInteger, renderAnalysisScope, resolveProjectToolContext } from "./shared.ts";

export interface ListIssuesToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  limit?: number;
  page?: number;
}

export interface ListIssuesPagination {
  page: number;
  pageSize: number;
  total?: number;
  activeReturned: number;
  excludedNonActive: number;
  shown: number;
}

export interface ListIssuesDetails {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  issues: AgentIssueSummary[];
  pagination: ListIssuesPagination;
  request: ReturnType<typeof buildIssueSearchEndpoint>;
  exclusionNote: string;
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
}

const DEFAULT_ISSUE_LIMIT = 50;
const MAX_ISSUE_LIMIT = 100;
const NON_ACTIVE_EXCLUSION_NOTE =
  "False-positive, ignored, accepted, resolved, closed, and equivalent non-active issues are omitted.";

const listIssuesParameters = Type.Object({
  projectKey: Type.Optional(
    Type.String({
      description:
        "Sonar project key. If omitted, AnalyseMe resolves SONARQUBE_PROJECT_KEY or sonar-project.properties sonar.projectKey.",
    }),
  ),
  organization: Type.Optional(
    Type.String({
      description: "Optional SonarCloud organization. Overrides SONARQUBE_ORGANIZATION for this call.",
    }),
  ),
  branch: Type.Optional(
    Type.String({
      description: "Optional Sonar branch analysis scope. Mutually exclusive with pullRequest.",
    }),
  ),
  pullRequest: Type.Optional(
    Type.String({
      description: "Optional Sonar pull request analysis scope. Mutually exclusive with branch.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_ISSUE_LIMIT,
      description: `Maximum issue rows to request and render for this page. Defaults to ${DEFAULT_ISSUE_LIMIT}; max ${MAX_ISSUE_LIMIT}.`,
    }),
  ),
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Sonar issue search page number to request. Defaults to 1.",
    }),
  ),
});

export function registerListIssuesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.listIssues,
    label: "AnalyseMe List Issues",
    description:
      "Read active SonarQube/SonarCloud issues for a project, excluding false-positive, ignored, accepted, resolved, and closed results.",
    promptSnippet: "List active SonarQube/SonarCloud issues for a project without mutating Sonar state.",
    promptGuidelines: [
      "Use analyseme_list_issues when the user asks for actionable Sonar issues to fix in the current project.",
      "analyseme_list_issues omits false-positive, ignored, accepted, resolved, closed, and equivalent non-active Sonar results.",
      "analyseme_list_issues is read-only and never changes Sonar issue status, assignees, comments, or project configuration.",
    ],
    parameters: listIssuesParameters,
    execute: executeListIssuesTool,
  });
}

export async function executeListIssuesTool(
  _toolCallId: string,
  params: ListIssuesToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: ListIssuesDetails }> {
  const page = normalizePositiveInteger(params.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = normalizePositiveInteger(params.limit, DEFAULT_ISSUE_LIMIT, MAX_ISSUE_LIMIT);
  const resolvedContext = await resolveProjectToolContext(ctx, params);
  const request = buildIssueSearchEndpoint({ ...resolvedContext.endpointOptions, page, pageSize });
  const client = createSonarClient(resolvedContext.config);
  const response = await client.getJson<unknown>({ ...request, signal });
  const rawIssues = extractIssuePayloads(response);
  const activeIssuePayloads = filterActiveIssuePayloads(rawIssues);
  const issues = activeIssuePayloads.map(mapIssueSummary);
  const scopeLabel = renderAnalysisScope(resolvedContext.scope);
  const pagination = readListIssuesPagination(response, page, pageSize, rawIssues.length, issues.length);
  const rendered = renderListIssues({
    projectKey: resolvedContext.projectKey,
    projectKeySource: resolvedContext.projectKeySource,
    organization: resolvedContext.organization,
    scope: scopeLabel,
    issues,
    pagination,
  });
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      projectKey: resolvedContext.projectKey,
      projectKeySource: resolvedContext.projectKeySource,
      organization: resolvedContext.organization,
      scope: scopeLabel,
      issues,
      pagination,
      request,
      exclusionNote: NON_ACTIVE_EXCLUSION_NOTE,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
    },
  };
}

function extractIssuePayloads(response: unknown): unknown[] {
  const payload = asRecord(response);
  const issues = payload.issues;

  return Array.isArray(issues) ? issues : [];
}

function filterActiveIssuePayloads(issues: unknown[]): unknown[] {
  const activeIssues: unknown[] = [];

  for (const issue of issues) {
    if (isActiveSonarIssue(toSonarIssueLike(issue))) activeIssues.push(issue);
  }

  return activeIssues;
}

function toSonarIssueLike(issue: unknown): SonarIssueLike {
  const payload = asRecord(issue);

  return {
    status: stringField(payload, "status"),
    issueStatus: stringField(payload, "issueStatus"),
    resolution: stringField(payload, "resolution"),
    resolved: booleanField(payload, "resolved"),
    falsePositive: booleanField(payload, "falsePositive"),
    isFalsePositive: booleanField(payload, "isFalsePositive"),
    accepted: booleanField(payload, "accepted"),
    ignored: booleanField(payload, "ignored"),
  };
}

function readListIssuesPagination(
  response: unknown,
  page: number,
  pageSize: number,
  rawReturned: number,
  activeReturned: number,
): ListIssuesPagination {
  const payload = asRecord(response);
  const paging = asRecord(payload.paging);

  return {
    page: numberField(paging, "pageIndex") ?? numberField(payload, "p") ?? page,
    pageSize: numberField(paging, "pageSize") ?? numberField(payload, "ps") ?? pageSize,
    total: numberField(paging, "total") ?? numberField(payload, "total"),
    activeReturned,
    excludedNonActive: Math.max(0, rawReturned - activeReturned),
    shown: activeReturned,
  };
}

function renderListIssues(input: {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  issues: AgentIssueSummary[];
  pagination: ListIssuesPagination;
}): string {
  const lines = [
    `# AnalyseMe active issues: ${input.projectKey}`,
    "",
    `- Project key source: ${input.projectKeySource}`,
    `- Organization: ${input.organization ?? "not set"}`,
    `- Scope: ${input.scope}`,
    `- Page: ${input.pagination.page}`,
    `- Page size: ${input.pagination.pageSize}`,
    `- Server total: ${input.pagination.total ?? "unavailable"}`,
    `- Active issues shown: ${input.pagination.shown}`,
    `- Excluded from this page: ${input.pagination.excludedNonActive}`,
    `- Exclusion note: ${NON_ACTIVE_EXCLUSION_NOTE}`,
    "",
    "## Issues",
  ];

  if (input.issues.length === 0) lines.push("- No active issues returned for this page.");

  input.issues.forEach((issue, index) => {
    lines.push(...renderIssueRow(issue, index + 1));
  });

  return lines.join("\n");
}

function renderIssueRow(issue: AgentIssueSummary, index: number): string[] {
  return [
    `${index}. ${renderIssueTitle(issue)}`,
    `   - Severity/impact: ${renderSeverityAndImpact(issue)}`,
    `   - Type: ${issue.type ?? "unavailable"}`,
    `   - Status/resolution: ${renderStatusAndResolution(issue)}`,
    `   - Rule: ${issue.rule ?? "unavailable"}`,
    `   - Location: ${renderIssueLocation(issue)}`,
    `   - Tags: ${issue.tags.length > 0 ? issue.tags.join(", ") : "none"}`,
  ];
}

function renderIssueTitle(issue: AgentIssueSummary): string {
  return `\`${issue.key}\` — ${issue.message ?? "No message returned by Sonar."}`;
}

function renderSeverityAndImpact(issue: AgentIssueSummary): string {
  const severity = issue.severity ?? "unavailable";
  const impacts = issue.impacts.length > 0 ? issue.impacts.join(", ") : "none";

  return `${severity}; impacts: ${impacts}`;
}

function renderStatusAndResolution(issue: AgentIssueSummary): string {
  const status = issue.issueStatus ?? issue.status ?? "unavailable";
  const resolution = issue.resolution ?? "none";

  return `${status}; resolution: ${resolution}`;
}

function renderIssueLocation(issue: AgentIssueSummary): string {
  const component = issue.location.component ?? "unavailable component";
  const file = issue.location.file ? ` (${issue.location.file})` : "";
  const line = issue.location.line ? `:${issue.location.line}` : "";
  const range = renderTextRange(issue.location.textRange);

  return `${component}${file}${line}${range}`;
}

function renderTextRange(textRange: AgentIssueSummary["location"]["textRange"]): string {
  if (!textRange) return "";

  const startLine = textRange.startLine ?? "?";
  const endLine = textRange.endLine ?? startLine;
  const startOffset = textRange.startOffset ?? "?";
  const endOffset = textRange.endOffset ?? "?";

  return ` (range ${startLine}:${startOffset}-${endLine}:${endOffset})`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
