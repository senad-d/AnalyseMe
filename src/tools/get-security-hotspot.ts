import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { resolveAnalysisScope } from "../config/analysis-scope.ts";
import { requireAnalyseMeConfig } from "../config/load-config.ts";
import { resolveProjectKey } from "../config/project-key.ts";
import type { AnalysisScopeResolution, SonarConnectionConfig } from "../config/types.ts";
import { buildHotspotDetailEndpoint, buildSourceShowEndpoint } from "../sonar/endpoints.ts";
import type { EndpointRequest } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { SonarClient } from "../sonar/client.ts";
import type { AgentSecurityHotspotDetail, AgentSecurityHotspotSummary } from "../sonar/hotspot-mapping.ts";
import { mapSecurityHotspotDetail } from "../sonar/hotspot-mapping.ts";
import { redactSecrets } from "../utils/mask.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { renderAnalysisScope } from "./shared.ts";

export interface GetSecurityHotspotToolInput {
  hotspotKey: string;
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface HotspotLinks {
  hotspot?: string;
}

export interface GetSecurityHotspotDetails {
  hotspotKey: string;
  projectKey?: string;
  projectKeySource?: string;
  organization?: string;
  scope: string;
  hotspot: AgentSecurityHotspotDetail;
  links: HotspotLinks;
  requests: {
    hotspot: ReturnType<typeof buildHotspotDetailEndpoint>;
    sourceAttempts: EndpointRequest[];
  };
  warnings: string[];
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
}

interface OptionalHotspotProjectContext {
  config: SonarConnectionConfig;
  projectKey?: string;
  projectKeySource?: string;
  organization?: string;
  scope: AnalysisScopeResolution;
}

interface HotspotSourceReadResult {
  source?: unknown;
  requests: EndpointRequest[];
  warnings: string[];
}

const getSecurityHotspotParameters = Type.Object({
  hotspotKey: Type.String({
    description: "Sonar security hotspot key/id to retrieve with location context and Sonar-provided guidance.",
  }),
  projectKey: Type.Optional(
    Type.String({
      description:
        "Optional Sonar project key used for hotspot links and source context. If omitted, AnalyseMe tries SONARQUBE_PROJECT_KEY and sonar-project.properties.",
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

export function registerGetSecurityHotspotTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.getSecurityHotspot,
    label: "AnalyseMe Get Security Hotspot",
    description:
      "Read a specific SonarQube/SonarCloud security hotspot with location details and Sonar-provided security guidance without mutating Sonar state.",
    promptSnippet: "Read one Sonar security hotspot, including location details and Sonar-provided security guidance.",
    promptGuidelines: [
      "Use analyseme_get_security_hotspot after analyseme_list_security_hotspots when the agent needs exact hotspot location, flows, snippets, or Sonar security guidance.",
      "analyseme_get_security_hotspot must use only Sonar-provided security guidance and must not invent remediation advice.",
      "analyseme_get_security_hotspot is read-only and never changes hotspot status, issue status, assignees, comments, or project configuration.",
    ],
    parameters: getSecurityHotspotParameters,
    execute: executeGetSecurityHotspotTool,
  });
}

export async function executeGetSecurityHotspotTool(
  _toolCallId: string,
  params: GetSecurityHotspotToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: GetSecurityHotspotDetails }> {
  const resolvedContext = await resolveOptionalHotspotProjectContext(ctx, params);
  const hotspotRequest = buildHotspotDetailEndpoint(buildHotspotEndpointOptions(params.hotspotKey, resolvedContext));
  const client = createSonarClient(resolvedContext.config);
  const hotspotResponse = await client.getJson<unknown>({ ...hotspotRequest, signal });
  const hotspotPayload = extractHotspotPayload(hotspotResponse, params.hotspotKey);
  const sourceResult = await readHotspotSourcePayload(
    client,
    hotspotPayload,
    resolvedContext,
    signal,
    resolvedContext.config.token,
  );
  const hotspot = mapSecurityHotspotDetail(hotspotPayload, sourceResult.source);
  const links = buildHotspotLinks(resolvedContext.config.url, hotspot, resolvedContext.projectKey);
  const warnings = sourceResult.warnings;
  const rendered = renderSecurityHotspotDetail(hotspot, resolvedContext, links, warnings);
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      hotspotKey: params.hotspotKey,
      projectKey: resolvedContext.projectKey,
      projectKeySource: resolvedContext.projectKeySource,
      organization: resolvedContext.organization,
      scope: renderAnalysisScope(resolvedContext.scope),
      hotspot,
      links,
      requests: {
        hotspot: hotspotRequest,
        sourceAttempts: sourceResult.requests,
      },
      warnings,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
    },
  };
}

async function resolveOptionalHotspotProjectContext(
  ctx: ExtensionContext,
  params: GetSecurityHotspotToolInput,
): Promise<OptionalHotspotProjectContext> {
  const config = await requireAnalyseMeConfig({ cwd: ctx.cwd });
  const projectKeyResolution = await resolveProjectKey({
    cwd: ctx.cwd,
    explicitProjectKey: params.projectKey,
    configuredProjectKey: config.projectKey,
  });
  const scope = await resolveAnalysisScope({
    cwd: ctx.cwd,
    explicitBranch: params.branch,
    explicitPullRequest: params.pullRequest,
    configuredBranch: config.branch,
    configuredPullRequest: config.pullRequest,
  });

  return {
    config,
    projectKey: projectKeyResolution.projectKey,
    projectKeySource: projectKeyResolution.projectKey ? projectKeyResolution.source : undefined,
    organization: normalizeOptionalText(params.organization) ?? config.organization,
    scope,
  };
}

function buildHotspotEndpointOptions(
  hotspotKey: string,
  context: OptionalHotspotProjectContext,
): { hotspotKey: string; organization?: string; branch?: string; pullRequest?: string } {
  if (context.scope.scope.kind === "branch") {
    return { hotspotKey, organization: context.organization, branch: context.scope.scope.branch };
  }

  if (context.scope.scope.kind === "pullRequest") {
    return { hotspotKey, organization: context.organization, pullRequest: context.scope.scope.pullRequest };
  }

  return { hotspotKey, organization: context.organization };
}

function buildSourceEndpointOptions(
  componentKey: string,
  line: number,
  context: OptionalHotspotProjectContext,
): { componentKey: string; from: number; to: number; organization?: string; branch?: string; pullRequest?: string } {
  const from = Math.max(1, line - 3);
  const to = line + 3;

  if (context.scope.scope.kind === "branch") {
    return { componentKey, from, to, organization: context.organization, branch: context.scope.scope.branch };
  }

  if (context.scope.scope.kind === "pullRequest") {
    return { componentKey, from, to, organization: context.organization, pullRequest: context.scope.scope.pullRequest };
  }

  return { componentKey, from, to, organization: context.organization };
}

function extractHotspotPayload(response: unknown, hotspotKey: string): unknown {
  const payload = asRecord(response);
  const hotspot = payload.hotspot ?? response;
  const hotspotRecord = asRecord(hotspot);

  if (!stringField(hotspotRecord, "key")) {
    throw new Error(`Sonar security hotspot ${hotspotKey} was not found.`);
  }

  return hotspot;
}

async function readHotspotSourcePayload(
  client: SonarClient,
  hotspotPayload: unknown,
  context: OptionalHotspotProjectContext,
  signal: AbortSignal | undefined,
  token: string,
): Promise<HotspotSourceReadResult> {
  const hotspot = asRecord(hotspotPayload);
  const component = stringField(hotspot, "component");
  const line = numberField(hotspot, "line");

  if (!component || !line) {
    return { requests: [], warnings: ["Source context unavailable because hotspot component or line is missing."] };
  }

  const request = buildSourceShowEndpoint(buildSourceEndpointOptions(component, line, context));

  try {
    const source = await client.getJson<unknown>({ ...request, signal });
    return { source, requests: [request], warnings: [] };
  } catch (error) {
    return {
      requests: [request],
      warnings: [`Source context unavailable: ${redactSecrets(errorMessage(error), [token])}`],
    };
  }
}

function buildHotspotLinks(
  baseUrl: string,
  hotspot: AgentSecurityHotspotDetail,
  projectKey: string | undefined,
): HotspotLinks {
  return {
    hotspot: projectKey
      ? buildUrl(baseUrl, "/security_hotspots", { id: projectKey, hotspots: hotspot.key, open: hotspot.key })
      : undefined,
  };
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string>): string | undefined {
  try {
    const url = new URL(path, `${baseUrl}/`);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function renderSecurityHotspotDetail(
  hotspot: AgentSecurityHotspotDetail,
  context: OptionalHotspotProjectContext,
  links: HotspotLinks,
  warnings: string[],
): string {
  const lines = [
    `# AnalyseMe security hotspot: ${hotspot.key}`,
    "",
    `- Project key: ${context.projectKey ?? "not resolved"}`,
    `- Project key source: ${context.projectKeySource ?? "missing"}`,
    `- Organization: ${context.organization ?? "not set"}`,
    `- Scope: ${renderAnalysisScope(context.scope)}`,
    `- Message: ${hotspot.message ?? "No message returned by Sonar."}`,
    `- Status/resolution: ${renderStatusAndResolution(hotspot)}`,
    `- Vulnerability probability: ${hotspot.vulnerabilityProbability ?? "unavailable"}`,
    `- Security category: ${hotspot.securityCategory ?? "unavailable"}`,
    `- Location: ${renderHotspotLocation(hotspot)}`,
  ];

  if (links.hotspot) lines.push(`- Hotspot link: ${links.hotspot}`);

  lines.push("", "## Where is the hotspot?");
  lines.push(...renderSourceSnippets(hotspot));
  lines.push(...renderSecondaryLocations(hotspot));
  lines.push(...renderFlows(hotspot));
  lines.push("", "## Sonar-provided security guidance");
  lines.push(...renderSecurityGuidance(hotspot));

  if (warnings.length > 0) {
    lines.push("", "## Warnings");

    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function renderSourceSnippets(hotspot: AgentSecurityHotspotDetail): string[] {
  if (hotspot.sourceSnippets.length === 0) return ["- Source context unavailable from Sonar."];

  const lines = ["### Source context"];

  for (const snippet of hotspot.sourceSnippets) {
    const line = snippet.line ? `${snippet.line}: ` : "";
    lines.push(`- ${line}${snippet.text}`);
  }

  return lines;
}

function renderSecondaryLocations(hotspot: AgentSecurityHotspotDetail): string[] {
  if (hotspot.secondaryLocations.length === 0) return ["", "### Secondary locations", "- None returned by Sonar."];

  const lines = ["", "### Secondary locations"];

  for (const location of hotspot.secondaryLocations) {
    lines.push(`- ${renderLocation(location)}`);
  }

  return lines;
}

function renderFlows(hotspot: AgentSecurityHotspotDetail): string[] {
  if (hotspot.flows.length === 0) return ["", "### Flows", "- None returned by Sonar."];

  const lines = ["", "### Flows"];

  hotspot.flows.forEach((flow, index) => {
    lines.push(`- Flow ${index + 1}: ${flow.map(renderLocation).join(" -> ")}`);
  });

  return lines;
}

function renderSecurityGuidance(hotspot: AgentSecurityHotspotDetail): string[] {
  const lines: string[] = [];

  if (hotspot.guidance.riskDescription) lines.push(`- Risk: ${hotspot.guidance.riskDescription}`);
  if (hotspot.guidance.vulnerabilityDescription) {
    lines.push(`- Vulnerability: ${hotspot.guidance.vulnerabilityDescription}`);
  }
  if (hotspot.guidance.fixRecommendation) lines.push(`- Fix recommendation: ${hotspot.guidance.fixRecommendation}`);
  if (lines.length === 0) lines.push("Sonar did not return security guidance for this hotspot.");

  return lines;
}

function renderStatusAndResolution(hotspot: AgentSecurityHotspotSummary): string {
  return `${hotspot.status ?? "unavailable"}; resolution: ${hotspot.resolution ?? "none"}`;
}

function renderHotspotLocation(hotspot: AgentSecurityHotspotSummary): string {
  return renderLocation(hotspot.location);
}

function renderLocation(location: AgentSecurityHotspotSummary["location"]): string {
  const component = location.component ?? "unavailable component";
  const file = location.file ? ` (${location.file})` : "";
  const line = location.line ? `:${location.line}` : "";
  const range = renderTextRange(location.textRange);

  return `${component}${file}${line}${range}`;
}

function renderTextRange(textRange: AgentSecurityHotspotSummary["location"]["textRange"]): string {
  if (!textRange) return "";

  const startLine = textRange.startLine ?? "?";
  const endLine = textRange.endLine ?? startLine;
  const startOffset = textRange.startOffset ?? "?";
  const endOffset = textRange.endOffset ?? "?";

  return ` (range ${startLine}:${startOffset}-${endLine}:${endOffset})`;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
