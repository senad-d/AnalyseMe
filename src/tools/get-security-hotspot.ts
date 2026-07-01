import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { buildHotspotDetailEndpoint, buildSourceShowEndpoint } from "../sonar/endpoints.ts";
import type { EndpointRequest } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { SonarClient } from "../sonar/client.ts";
import type { AgentSecurityHotspotDetail, AgentSecurityHotspotSummary } from "../sonar/hotspot-mapping.ts";
import { mapSecurityHotspotDetail } from "../sonar/hotspot-mapping.ts";
import { rethrowIfAbortError } from "../utils/abort.ts";
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
  numberField,
  renderAnalysisScope,
  renderLocation,
  requireNonEmptyToolString,
  resolveOptionalProjectToolContext,
  stringField,
} from "./shared.ts";
import type { OptionalProjectToolContext } from "./shared.ts";

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
  textSafety: SonarTextSafetySummary;
}

interface HotspotSourceReadResult {
  source?: unknown;
  requests: EndpointRequest[];
  warnings: string[];
}

const getSecurityHotspotParameters = Type.Object({
  hotspotKey: Type.String({
    minLength: 1,
    description:
      "Required Sonar security hotspot key/id to retrieve with location context and Sonar-provided guidance. Empty values are rejected.",
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
  const hotspotKey = requireNonEmptyToolString(
    params.hotspotKey,
    "hotspotKey",
    "a Sonar security hotspot key such as HOTSPOT-123",
  );
  const normalizedParams = normalizeProjectScopedToolInput(params);
  const resolvedContext = await resolveOptionalProjectToolContext(ctx, normalizedParams);
  const hotspotRequest = buildHotspotDetailEndpoint({ hotspotKey, ...buildScopeEndpointOptions(resolvedContext) });
  const client = createSonarClient(resolvedContext.config);
  const hotspotResponse = await client.getJson<unknown>({ ...hotspotRequest, signal });
  const hotspotPayload = extractHotspotPayload(hotspotResponse, hotspotKey);
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
  const textSafety = summarizeSonarTextSafety({ hotspot, warnings });
  const rendered = renderSecurityHotspotDetail(hotspot, resolvedContext, links, warnings);
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      hotspotKey,
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
      textSafety,
    },
  };
}

function extractHotspotPayload(response: unknown, hotspotKey: string): unknown {
  const payload = asRecord(response);
  const hotspot = payload.hotspot ?? response;
  const hotspotRecord = asRecord(hotspot);

  const returnedHotspotKey = stringField(hotspotRecord, "key");

  if (returnedHotspotKey !== hotspotKey) {
    throw new Error(`Sonar security hotspot ${hotspotKey} was not found in the hotspot detail response.`);
  }

  return hotspot;
}

async function readHotspotSourcePayload(
  client: SonarClient,
  hotspotPayload: unknown,
  context: OptionalProjectToolContext,
  signal: AbortSignal | undefined,
  token: string,
): Promise<HotspotSourceReadResult> {
  const hotspot = asRecord(hotspotPayload);
  const component = stringField(hotspot, "component");
  const line = numberField(hotspot, "line");

  if (!component || !line) {
    return { requests: [], warnings: ["Source context unavailable because hotspot component or line is missing."] };
  }

  const request = buildSourceShowEndpoint(buildSourceShowEndpointOptions(component, line, context));

  try {
    const source = await client.getJson<unknown>({ ...request, signal });
    return { source, requests: [request], warnings: [] };
  } catch (error) {
    rethrowIfAbortError(error, signal);
    return {
      requests: [request],
      warnings: [`Source context unavailable: ${safeSonarWarningText(errorMessage(error), [token])}`],
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
      ? buildSonarUiUrl(baseUrl, "/security_hotspots", { id: projectKey, hotspots: hotspot.key, open: hotspot.key })
      : undefined,
  };
}

function renderSecurityHotspotDetail(
  hotspot: AgentSecurityHotspotDetail,
  context: OptionalProjectToolContext,
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

