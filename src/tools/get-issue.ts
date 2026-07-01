import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import {
  buildIssueDetailEndpoint,
  buildRuleDetailEndpoint,
  buildSourceIssueSnippetsEndpoint,
  buildSourceShowEndpoint,
} from "../sonar/endpoints.ts";
import type { EndpointRequest } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { SonarClient } from "../sonar/client.ts";
import type { AgentIssueDetail, AgentIssueSummary } from "../sonar/issue-mapping.ts";
import { mapIssueDetail } from "../sonar/issue-mapping.ts";
import { rethrowIfAbortError, throwIfAborted } from "../utils/abort.ts";
import { safeSonarWarningText, summarizeSonarTextSafety } from "../utils/text-safety.ts";
import type { SonarTextSafetySummary } from "../utils/text-safety.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import {
  asRecord,
  buildScopeEndpointOptions,
  buildSonarUiUrl,
  buildSourceShowEndpointOptions,
  errorMessage,
  normalizeProjectScopedToolInput,
  primaryLineFromPayload,
  renderAnalysisScope,
  renderLocation,
  requireNonEmptyToolString,
  resolveOptionalProjectToolContext,
  stringField,
} from "./shared.ts";
import type { OptionalProjectToolContext } from "./shared.ts";

export interface GetIssueToolInput {
  issueKey: string;
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface IssueLinks {
  issue?: string;
  rule?: string;
}

export interface GetIssueDetails {
  issueKey: string;
  projectKey?: string;
  projectKeySource?: string;
  organization?: string;
  scope: string;
  issue: AgentIssueDetail;
  links: IssueLinks;
  requests: {
    issue: ReturnType<typeof buildIssueDetailEndpoint>;
    rule?: ReturnType<typeof buildRuleDetailEndpoint>;
    sourceAttempts: EndpointRequest[];
  };
  warnings: string[];
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
  textSafety: SonarTextSafetySummary;
}

interface RuleReadResult {
  rule?: unknown;
  request?: ReturnType<typeof buildRuleDetailEndpoint>;
  warnings: string[];
}

interface SourceReadResult {
  source?: unknown;
  requests: EndpointRequest[];
  warnings: string[];
}

const getIssueParameters = Type.Object({
  issueKey: Type.String({
    minLength: 1,
    description:
      "Required Sonar issue key/id to retrieve with location context and Sonar-provided rule guidance. Empty values are rejected.",
  }),
  projectKey: Type.Optional(
    Type.String({
      description:
        "Optional Sonar project key used for issue links and source context. If omitted, AnalyseMe tries SONARQUBE_PROJECT_KEY and sonar-project.properties.",
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
});

export function registerGetIssueTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.getIssue,
    label: "AnalyseMe Get Issue",
    description:
      "Read a specific SonarQube/SonarCloud issue with location details and Sonar-provided rule guidance without mutating Sonar state.",
    promptSnippet: "Read one Sonar issue, including location details and Sonar-provided rule guidance.",
    promptGuidelines: [
      "Use analyseme_get_issue after analyseme_list_issues when the agent needs exact issue location, flows, snippets, or Sonar rule guidance.",
      "analyseme_get_issue must use only Sonar-provided guidance and must not invent remediation advice.",
      "analyseme_get_issue is read-only and never changes Sonar issue status, assignees, comments, or project configuration.",
    ],
    parameters: getIssueParameters,
    execute: executeGetIssueTool,
  });
}

export async function executeGetIssueTool(
  _toolCallId: string,
  params: GetIssueToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: GetIssueDetails }> {
  const issueKey = requireNonEmptyToolString(params.issueKey, "issueKey", "a Sonar issue key such as ISSUE-123");
  const normalizedParams = normalizeProjectScopedToolInput(params);
  const resolvedContext = await resolveOptionalProjectToolContext(ctx, normalizedParams);
  const issueRequest = buildIssueDetailEndpoint({ issueKey, ...buildScopeEndpointOptions(resolvedContext) });
  const client = createSonarClient(resolvedContext.config);
  const issueResponse = await client.getJson<unknown>({ ...issueRequest, signal });
  const issuePayload = extractSingleIssuePayload(issueResponse, issueKey);
  const ruleResult = await readRulePayload(client, issuePayload, resolvedContext.organization, signal, resolvedContext.config.token);
  const sourceResult = await readSourcePayload(
    client,
    issueKey,
    issuePayload,
    resolvedContext,
    signal,
    resolvedContext.config.token,
  );
  const issue = mapIssueDetail(issuePayload, ruleResult.rule, sourceResult.source);
  const warnings = [...ruleResult.warnings, ...sourceResult.warnings];
  const textSafety = summarizeSonarTextSafety({ issue, warnings });
  const links = buildIssueLinks(resolvedContext.config.url, issue, resolvedContext.projectKey);
  const rendered = renderIssueDetail(issue, resolvedContext, links, warnings);
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      issueKey,
      projectKey: resolvedContext.projectKey,
      projectKeySource: resolvedContext.projectKeySource,
      organization: resolvedContext.organization,
      scope: renderAnalysisScope(resolvedContext.scope),
      issue,
      links,
      requests: {
        issue: issueRequest,
        rule: ruleResult.request,
        sourceAttempts: sourceResult.requests,
      },
      warnings,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
      textSafety,
    },
  };
}

function extractSingleIssuePayload(response: unknown, issueKey: string): unknown {
  const payload = asRecord(response);
  const issues = Array.isArray(payload.issues) ? payload.issues : [];

  const matchingIssue = issues.find((issue) => stringField(asRecord(issue), "key") === issueKey);

  if (!matchingIssue) {
    throw new Error(`Sonar issue ${issueKey} was not found in the issue detail response.`);
  }

  return matchingIssue;
}

async function readRulePayload(
  client: SonarClient,
  issuePayload: unknown,
  organization: string | undefined,
  signal: AbortSignal | undefined,
  token: string,
): Promise<RuleReadResult> {
  const issue = asRecord(issuePayload);
  const ruleKey = stringField(issue, "rule");

  if (!ruleKey) return { warnings: ["Issue has no rule key; rule guidance is unavailable."] };

  const request = buildRuleDetailEndpoint({ ruleKey, organization });

  try {
    const response = await client.getJson<unknown>({ ...request, signal });
    return { rule: extractRulePayload(response), request, warnings: [] };
  } catch (error) {
    rethrowIfAbortError(error, signal);
    return { request, warnings: [`Rule metadata unavailable: ${safeSonarWarningText(errorMessage(error), [token])}`] };
  }
}

async function readSourcePayload(
  client: SonarClient,
  issueKey: string,
  issuePayload: unknown,
  context: OptionalProjectToolContext,
  signal: AbortSignal | undefined,
  token: string,
): Promise<SourceReadResult> {
  const snippetResult = await readSourceIssueSnippets(client, issueKey, context.organization, signal, token);
  if (snippetResult.source) return snippetResult;

  throwIfAborted(signal);
  const fallbackResult = await readSourceShowFallback(client, issuePayload, context, signal, token);

  return {
    source: fallbackResult.source,
    requests: [...snippetResult.requests, ...fallbackResult.requests],
    warnings: [...snippetResult.warnings, ...fallbackResult.warnings],
  };
}

async function readSourceIssueSnippets(
  client: SonarClient,
  issueKey: string,
  organization: string | undefined,
  signal: AbortSignal | undefined,
  token: string,
): Promise<SourceReadResult> {
  const request = buildSourceIssueSnippetsEndpoint({ issueKey, organization });

  try {
    const source = await client.getJson<unknown>({ ...request, signal });
    return { source, requests: [request], warnings: [] };
  } catch (error) {
    rethrowIfAbortError(error, signal);
    return {
      requests: [request],
      warnings: [`Source issue snippets unavailable: ${safeSonarWarningText(errorMessage(error), [token])}`],
    };
  }
}

async function readSourceShowFallback(
  client: SonarClient,
  issuePayload: unknown,
  context: OptionalProjectToolContext,
  signal: AbortSignal | undefined,
  token: string,
): Promise<SourceReadResult> {
  const issue = asRecord(issuePayload);
  const component = stringField(issue, "component");
  const line = primaryLineFromPayload(issue);

  if (!component || !line) {
    return { requests: [], warnings: ["Source fallback unavailable because issue component or line is missing."] };
  }

  const request = buildSourceShowEndpoint(buildSourceShowEndpointOptions(component, line, context));

  try {
    const source = await client.getJson<unknown>({ ...request, signal });
    return { source, requests: [request], warnings: [] };
  } catch (error) {
    rethrowIfAbortError(error, signal);
    return {
      requests: [request],
      warnings: [`Source fallback unavailable: ${safeSonarWarningText(errorMessage(error), [token])}`],
    };
  }
}

function extractRulePayload(response: unknown): unknown {
  const payload = asRecord(response);
  return payload.rule ?? response;
}

function buildIssueLinks(baseUrl: string, issue: AgentIssueDetail, projectKey: string | undefined): IssueLinks {
  return {
    issue: projectKey
      ? buildSonarUiUrl(baseUrl, "/project/issues", { id: projectKey, issues: issue.key, open: issue.key })
      : undefined,
    rule: issue.rule ? buildSonarUiUrl(baseUrl, "/coding_rules", { open: issue.rule, rule_key: issue.rule }) : undefined,
  };
}

function renderIssueDetail(
  issue: AgentIssueDetail,
  context: OptionalProjectToolContext,
  links: IssueLinks,
  warnings: string[],
): string {
  const lines = [
    `# AnalyseMe issue: ${issue.key}`,
    "",
    `- Project key: ${context.projectKey ?? "not resolved"}`,
    `- Project key source: ${context.projectKeySource ?? "missing"}`,
    `- Organization: ${context.organization ?? "not set"}`,
    `- Scope: ${renderAnalysisScope(context.scope)}`,
    `- Message: ${issue.message ?? "No message returned by Sonar."}`,
    `- Severity/impact: ${renderSeverityAndImpact(issue)}`,
    `- Type: ${issue.type ?? "unavailable"}`,
    `- Status/resolution: ${renderStatusAndResolution(issue)}`,
    `- Rule: ${renderRule(issue)}`,
    `- Location: ${renderIssueLocation(issue)}`,
  ];

  if (links.issue) lines.push(`- Issue link: ${links.issue}`);
  if (links.rule) lines.push(`- Rule link: ${links.rule}`);

  lines.push(
    "",
    "## Where is the issue?",
    ...renderSourceSnippets(issue),
    ...renderSecondaryLocations(issue),
    ...renderFlows(issue),
    "",
    "## Sonar-provided rule guidance",
    issue.guidance ?? "Sonar did not return rule guidance for this issue.",
  );

  if (warnings.length > 0) {
    lines.push("", "## Warnings");

    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function renderSourceSnippets(issue: AgentIssueDetail): string[] {
  if (issue.sourceSnippets.length === 0) return ["- Source/location snippets unavailable from Sonar."];

  const lines = ["### Source snippets"];

  for (const snippet of issue.sourceSnippets) {
    const line = snippet.line ? `${snippet.line}: ` : "";
    lines.push(`- ${line}${snippet.text}`);
  }

  return lines;
}

function renderSecondaryLocations(issue: AgentIssueDetail): string[] {
  if (issue.secondaryLocations.length === 0) return ["", "### Secondary locations", "- None returned by Sonar."];

  const lines = ["", "### Secondary locations"];

  for (const location of issue.secondaryLocations) {
    lines.push(`- ${renderLocation(location)}`);
  }

  return lines;
}

function renderFlows(issue: AgentIssueDetail): string[] {
  if (issue.flows.length === 0) return ["", "### Flows", "- None returned by Sonar."];

  const lines = ["", "### Flows"];

  issue.flows.forEach((flow, index) => {
    lines.push(`- Flow ${index + 1}: ${flow.map(renderLocation).join(" -> ")}`);
  });

  return lines;
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

function renderRule(issue: AgentIssueDetail): string {
  if (issue.rule && issue.ruleName) return `${issue.rule} — ${issue.ruleName}`;
  if (issue.rule) return issue.rule;

  return "unavailable";
}

function renderIssueLocation(issue: AgentIssueDetail): string {
  return renderLocation(issue.location);
}

