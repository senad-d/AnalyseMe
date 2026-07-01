import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { buildHotspotSearchEndpoint } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { AgentSecurityHotspotSummary } from "../sonar/hotspot-mapping.ts";
import { filterSecurityHotspotsRequiringReview, mapHotspotSearchResponse } from "../sonar/hotspot-mapping.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { normalizePositiveInteger, renderAnalysisScope, resolveProjectToolContext } from "./shared.ts";

export interface ListSecurityHotspotsToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  limit?: number;
  page?: number;
}

export interface ListSecurityHotspotsPagination {
  page: number;
  pageSize: number;
  total?: number;
  requiringReviewReturned: number;
  excludedNonReview: number;
  shown: number;
}

export interface ListSecurityHotspotsDetails {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  hotspots: AgentSecurityHotspotSummary[];
  pagination: ListSecurityHotspotsPagination;
  request: ReturnType<typeof buildHotspotSearchEndpoint>;
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
}

const DEFAULT_HOTSPOT_LIMIT = 50;
const MAX_HOTSPOT_LIMIT = 100;

const listSecurityHotspotsParameters = Type.Object({
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
      maximum: MAX_HOTSPOT_LIMIT,
      description: `Maximum hotspot rows to request and render for this page. Defaults to ${DEFAULT_HOTSPOT_LIMIT}; max ${MAX_HOTSPOT_LIMIT}.`,
    }),
  ),
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Sonar hotspot search page number to request. Defaults to 1.",
    }),
  ),
});

export function registerListSecurityHotspotsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.listSecurityHotspots,
    label: "AnalyseMe List Security Hotspots",
    description:
      "Read SonarQube/SonarCloud security hotspots that require review without mutating Sonar hotspot or project state.",
    promptSnippet: "List SonarQube/SonarCloud security hotspots requiring review.",
    promptGuidelines: [
      "Use analyseme_list_security_hotspots when the user asks for Sonar security hotspots that need review.",
      "analyseme_list_security_hotspots treats security hotspots separately from normal Sonar issues and uses hotspot APIs.",
      "analyseme_list_security_hotspots is read-only and never changes hotspot status, issue status, assignees, comments, or project configuration.",
    ],
    parameters: listSecurityHotspotsParameters,
    execute: executeListSecurityHotspotsTool,
  });
}

export async function executeListSecurityHotspotsTool(
  _toolCallId: string,
  params: ListSecurityHotspotsToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: ListSecurityHotspotsDetails }> {
  const page = normalizePositiveInteger(params.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = normalizePositiveInteger(params.limit, DEFAULT_HOTSPOT_LIMIT, MAX_HOTSPOT_LIMIT);
  const resolvedContext = await resolveProjectToolContext(ctx, params);
  const request = buildHotspotSearchEndpoint({ ...resolvedContext.endpointOptions, page, pageSize });
  const client = createSonarClient(resolvedContext.config);
  const response = await client.getJson<unknown>({ ...request, signal });
  const mappedHotspots = mapHotspotSearchResponse(response);
  const hotspots = filterSecurityHotspotsRequiringReview(mappedHotspots);
  const scopeLabel = renderAnalysisScope(resolvedContext.scope);
  const pagination = readHotspotPagination(response, page, pageSize, mappedHotspots.length, hotspots.length);
  const rendered = renderSecurityHotspots({
    projectKey: resolvedContext.projectKey,
    projectKeySource: resolvedContext.projectKeySource,
    organization: resolvedContext.organization,
    scope: scopeLabel,
    hotspots,
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
      hotspots,
      pagination,
      request,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
    },
  };
}

function readHotspotPagination(
  response: unknown,
  page: number,
  pageSize: number,
  rawReturned: number,
  requiringReviewReturned: number,
): ListSecurityHotspotsPagination {
  const payload = asRecord(response);
  const paging = asRecord(payload.paging);

  return {
    page: numberField(paging, "pageIndex") ?? numberField(payload, "p") ?? page,
    pageSize: numberField(paging, "pageSize") ?? numberField(payload, "ps") ?? pageSize,
    total: numberField(paging, "total") ?? numberField(payload, "total"),
    requiringReviewReturned,
    excludedNonReview: Math.max(0, rawReturned - requiringReviewReturned),
    shown: requiringReviewReturned,
  };
}

function renderSecurityHotspots(input: {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  hotspots: AgentSecurityHotspotSummary[];
  pagination: ListSecurityHotspotsPagination;
}): string {
  const lines = [
    `# AnalyseMe security hotspots requiring review: ${input.projectKey}`,
    "",
    `- Project key source: ${input.projectKeySource}`,
    `- Organization: ${input.organization ?? "not set"}`,
    `- Scope: ${input.scope}`,
    `- Page: ${input.pagination.page}`,
    `- Page size: ${input.pagination.pageSize}`,
    `- Server total: ${input.pagination.total ?? "unavailable"}`,
    `- Hotspots shown: ${input.pagination.shown}`,
    `- Excluded from this page: ${input.pagination.excludedNonReview}`,
    "",
    "## Security hotspots",
  ];

  if (input.hotspots.length === 0) lines.push("- No security hotspots requiring review returned for this page.");

  input.hotspots.forEach((hotspot, index) => {
    lines.push(...renderHotspotRow(hotspot, index + 1));
  });

  return lines.join("\n");
}

function renderHotspotRow(hotspot: AgentSecurityHotspotSummary, index: number): string[] {
  return [
    `${index}. ${renderHotspotTitle(hotspot)}`,
    `   - Status/resolution: ${renderStatusAndResolution(hotspot)}`,
    `   - Vulnerability probability: ${hotspot.vulnerabilityProbability ?? "unavailable"}`,
    `   - Security category: ${hotspot.securityCategory ?? "unavailable"}`,
    `   - Location: ${renderHotspotLocation(hotspot)}`,
    `   - Author/assignee: ${hotspot.author ?? "unknown"} / ${hotspot.assignee ?? "unassigned"}`,
    `   - Created/updated: ${hotspot.createdAt ?? "unknown"} / ${hotspot.updatedAt ?? "unknown"}`,
  ];
}

function renderHotspotTitle(hotspot: AgentSecurityHotspotSummary): string {
  return `\`${hotspot.key}\` — ${hotspot.message ?? "No message returned by Sonar."}`;
}

function renderStatusAndResolution(hotspot: AgentSecurityHotspotSummary): string {
  return `${hotspot.status ?? "unavailable"}; resolution: ${hotspot.resolution ?? "none"}`;
}

function renderHotspotLocation(hotspot: AgentSecurityHotspotSummary): string {
  const component = hotspot.location.component ?? "unavailable component";
  const file = hotspot.location.file ? ` (${hotspot.location.file})` : "";
  const line = hotspot.location.line ? `:${hotspot.location.line}` : "";
  const range = renderTextRange(hotspot.location.textRange);

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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
