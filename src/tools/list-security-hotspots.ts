import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { buildHotspotSearchEndpoint } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { AgentSecurityHotspotSummary, SonarMappingInvalidRow } from "../sonar/hotspot-mapping.ts";
import {
  filterSecurityHotspotsRequiringReview,
  mapHotspotSearchResponseWithDiagnostics,
} from "../sonar/hotspot-mapping.ts";
import { summarizeSonarTextSafety } from "../utils/text-safety.ts";
import type { SonarTextSafetySummary } from "../utils/text-safety.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { asRecord, normalizePositiveInteger, numberField, renderAnalysisScope, renderLocation, resolveProjectToolContext } from "./shared.ts";

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
  malformedRowsSkipped: number;
  shown: number;
}

export interface ListSecurityHotspotsPartialData {
  warnings: string[];
  invalidRows: SonarMappingInvalidRow[];
  malformedRowsSkipped: number;
  missingHotspotsArray: boolean;
}

export interface ListSecurityHotspotsDetails {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  hotspots: AgentSecurityHotspotSummary[];
  pagination: ListSecurityHotspotsPagination;
  request: ReturnType<typeof buildHotspotSearchEndpoint>;
  warnings: string[];
  partialData: ListSecurityHotspotsPartialData;
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
  textSafety: SonarTextSafetySummary;
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
  const mappingResult = mapHotspotSearchResponseWithDiagnostics(response, {
    projectKey: resolvedContext.projectKey,
  });
  const mappedHotspots = mappingResult.hotspots;
  const hotspots = filterSecurityHotspotsRequiringReview(mappedHotspots);
  const warnings = mappingResult.warnings;
  const scopeLabel = renderAnalysisScope(resolvedContext.scope);
  const pagination = readHotspotPagination(
    response,
    page,
    pageSize,
    mappingResult.rawRowCount,
    mappingResult.invalidRows.length,
    hotspots.length,
  );
  const partialData = buildListHotspotsPartialData(
    mappingResult.missingHotspotsArray,
    mappingResult.invalidRows,
    warnings,
  );
  const textSafety = summarizeSonarTextSafety({ hotspots, warnings });
  const rendered = renderSecurityHotspots({
    projectKey: resolvedContext.projectKey,
    projectKeySource: resolvedContext.projectKeySource,
    organization: resolvedContext.organization,
    scope: scopeLabel,
    hotspots,
    pagination,
    warnings,
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
      warnings,
      partialData,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
      textSafety,
    },
  };
}

function buildListHotspotsPartialData(
  missingHotspotsArray: boolean,
  invalidRows: SonarMappingInvalidRow[],
  warnings: string[],
): ListSecurityHotspotsPartialData {
  return {
    warnings,
    invalidRows,
    malformedRowsSkipped: invalidRows.length,
    missingHotspotsArray,
  };
}

function readHotspotPagination(
  response: unknown,
  page: number,
  pageSize: number,
  rawReturned: number,
  malformedRowsSkipped: number,
  requiringReviewReturned: number,
): ListSecurityHotspotsPagination {
  const payload = asRecord(response);
  const paging = asRecord(payload.paging);

  return {
    page: numberField(paging, "pageIndex") ?? numberField(payload, "p") ?? page,
    pageSize: numberField(paging, "pageSize") ?? numberField(payload, "ps") ?? pageSize,
    total: numberField(paging, "total") ?? numberField(payload, "total"),
    requiringReviewReturned,
    excludedNonReview: Math.max(0, rawReturned - malformedRowsSkipped - requiringReviewReturned),
    malformedRowsSkipped,
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
  warnings: string[];
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
  ];

  if (input.pagination.malformedRowsSkipped > 0) {
    lines.push(`- Malformed rows skipped: ${input.pagination.malformedRowsSkipped}`);
  }

  lines.push("", "## Security hotspots");

  if (input.hotspots.length === 0) lines.push("- No security hotspots requiring review returned for this page.");

  input.hotspots.forEach((hotspot, index) => {
    lines.push(...renderHotspotRow(hotspot, index + 1));
  });

  if (input.warnings.length > 0) {
    lines.push("", "## Warnings");

    for (const warning of input.warnings) {
      lines.push(`- ${warning}`);
    }
  }

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
  return renderLocation(hotspot.location);
}
