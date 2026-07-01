import {
  SONAR_IDENTIFIER_TEXT_MAX_CHARS,
  SONAR_LONG_TEXT_MAX_CHARS,
  SONAR_MEDIUM_TEXT_MAX_CHARS,
  safeSonarString,
} from "../utils/text-safety.ts";
import type { AgentSourceSnippet, SonarIssueLocation } from "./issue-mapping.ts";
import { mapSourceSnippets } from "./issue-mapping.ts";

export interface SonarSecurityHotspotLike {
  status?: string;
  resolution?: string;
}

export interface AgentSecurityHotspotGuidance {
  riskDescription?: string;
  vulnerabilityDescription?: string;
  fixRecommendation?: string;
}

export interface AgentSecurityHotspotSummary {
  key: string;
  message?: string;
  status?: string;
  resolution?: string;
  vulnerabilityProbability?: string;
  securityCategory?: string;
  assignee?: string;
  author?: string;
  location: SonarIssueLocation;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentSecurityHotspotDetail extends AgentSecurityHotspotSummary {
  guidance: AgentSecurityHotspotGuidance;
  sourceSnippets: AgentSourceSnippet[];
  secondaryLocations: SonarIssueLocation[];
  flows: SonarIssueLocation[][];
}

export interface SonarMappingInvalidRow {
  index: number;
  reason: string;
}

export interface HotspotSummaryMappingResult {
  hotspots: AgentSecurityHotspotSummary[];
  invalidRows: SonarMappingInvalidRow[];
  warnings: string[];
  rawRowCount: number;
}

export interface HotspotSearchMappingResult extends HotspotSummaryMappingResult {
  missingHotspotsArray: boolean;
}

const NON_REVIEW_HOTSPOT_STATUSES = new Set(["REVIEWED", "SAFE", "FIXED", "ACKNOWLEDGED"]);
const NON_REVIEW_HOTSPOT_RESOLUTIONS = new Set(["SAFE", "FIXED", "ACKNOWLEDGED"]);

/**
 * Security hotspots are separate from issues. This filter keeps hotspots that
 * still require review and excludes reviewed/safe/fixed/acknowledged results.
 */
export function isSecurityHotspotRequiringReview(hotspot: SonarSecurityHotspotLike): boolean {
  if (isNonReviewHotspotStatus(hotspot.status)) return false;
  if (isNonReviewHotspotResolution(hotspot.resolution)) return false;

  return true;
}

export function filterSecurityHotspotsRequiringReview<THotspot extends SonarSecurityHotspotLike>(
  hotspots: THotspot[],
): THotspot[] {
  return hotspots.filter(isSecurityHotspotRequiringReview);
}

export function mapHotspotSearchResponse(response: unknown): AgentSecurityHotspotSummary[] {
  return mapHotspotSearchResponseWithDiagnostics(response).hotspots;
}

export function mapHotspotSearchResponseWithDiagnostics(response: unknown): HotspotSearchMappingResult {
  const payload = asRecord(response);
  const hotspots = payload.hotspots;

  if (!Array.isArray(hotspots)) {
    return {
      hotspots: [],
      invalidRows: [],
      warnings: ["Sonar hotspot search response did not include a hotspots array; no hotspot rows were mapped."],
      rawRowCount: 0,
      missingHotspotsArray: true,
    };
  }

  return {
    ...mapSecurityHotspotSummariesWithDiagnostics(hotspots),
    missingHotspotsArray: false,
  };
}

export function mapSecurityHotspotSummariesWithDiagnostics(hotspots: unknown[]): HotspotSummaryMappingResult {
  const mappedHotspots: AgentSecurityHotspotSummary[] = [];
  const invalidRows: SonarMappingInvalidRow[] = [];

  hotspots.forEach((hotspot, index) => {
    const validationError = validateSecurityHotspotSummaryPayload(hotspot);

    if (validationError) {
      invalidRows.push({ index, reason: validationError });
      return;
    }

    mappedHotspots.push(mapSecurityHotspotSummary(hotspot));
  });

  return {
    hotspots: mappedHotspots,
    invalidRows,
    warnings: buildHotspotMappingWarnings(invalidRows),
    rawRowCount: hotspots.length,
  };
}

export function mapSecurityHotspotSummary(hotspot: unknown): AgentSecurityHotspotSummary {
  const payload = asRecord(hotspot);

  return {
    key: requiredHotspotKey(payload),
    message: mediumStringField(payload, "message"),
    status: identifierField(payload, "status"),
    resolution: identifierField(payload, "resolution"),
    vulnerabilityProbability: identifierField(payload, "vulnerabilityProbability"),
    securityCategory: identifierField(payload, "securityCategory"),
    assignee: identifierField(payload, "assignee"),
    author: identifierField(payload, "author"),
    location: mapHotspotLocation(payload),
    createdAt: identifierField(payload, "creationDate") ?? identifierField(payload, "createdAt"),
    updatedAt: identifierField(payload, "updateDate") ?? identifierField(payload, "updatedAt"),
  };
}

export function mapSecurityHotspotDetail(hotspot: unknown, sourceResponse: unknown = undefined): AgentSecurityHotspotDetail {
  const summary = mapSecurityHotspotSummary(hotspot);

  return {
    ...summary,
    guidance: extractHotspotGuidance(hotspot),
    sourceSnippets: mapSourceSnippets(sourceResponse),
    secondaryLocations: mapSecondaryLocations(hotspot),
    flows: mapHotspotFlows(hotspot),
  };
}

export function extractHotspotGuidance(hotspot: unknown): AgentSecurityHotspotGuidance {
  const payload = asRecord(hotspot);
  const rule = asRecord(payload.rule);

  return {
    riskDescription: longStringField(payload, "riskDescription") ?? longStringField(rule, "riskDescription"),
    vulnerabilityDescription:
      longStringField(payload, "vulnerabilityDescription") ?? longStringField(rule, "vulnerabilityDescription"),
    fixRecommendation: longStringField(payload, "fixRecommendation") ?? longStringField(rule, "fixRecommendation"),
  };
}

function validateSecurityHotspotSummaryPayload(hotspot: unknown): string | undefined {
  const payload = asRecord(hotspot);
  if (!identifierField(payload, "key")) return "missing non-empty hotspot key";

  return undefined;
}

function requiredHotspotKey(payload: Record<string, unknown>): string {
  const key = identifierField(payload, "key");
  if (key) return key;

  throw new Error("Malformed Sonar security hotspot payload: missing non-empty hotspot key.");
}

function buildHotspotMappingWarnings(invalidRows: SonarMappingInvalidRow[]): string[] {
  if (invalidRows.length === 0) return [];

  return [
    `Skipped ${invalidRows.length} malformed Sonar hotspot row(s) because each hotspot must include a non-empty key for follow-up detail calls.`,
  ];
}

function mapHotspotLocation(payload: Record<string, unknown>): SonarIssueLocation {
  const component = mediumStringField(payload, "component");
  const textRange = mapTextRange(payload.textRange);

  return {
    component,
    file: component ? fileFromComponent(component) : undefined,
    line: numberField(payload, "line") ?? textRange?.startLine,
    textRange,
  };
}

function mapLocationPayload(value: unknown): SonarIssueLocation {
  const payload = asRecord(value);
  const component = mediumStringField(payload, "component");
  const textRange = mapTextRange(payload.textRange);

  return {
    component,
    file: component ? fileFromComponent(component) : undefined,
    line: numberField(payload, "line") ?? textRange?.startLine,
    textRange,
  };
}

function mapTextRange(value: unknown): SonarIssueLocation["textRange"] {
  const payload = asRecord(value);
  const startLine = numberField(payload, "startLine");
  const endLine = numberField(payload, "endLine");
  const startOffset = numberField(payload, "startOffset");
  const endOffset = numberField(payload, "endOffset");

  if (!startLine && !endLine && startOffset === undefined && endOffset === undefined) return undefined;

  return { startLine, endLine, startOffset, endOffset };
}

function mapSecondaryLocations(hotspot: unknown): SonarIssueLocation[] {
  const payload = asRecord(hotspot);
  return arrayField(payload, "secondaryLocations").map(mapLocationPayload);
}

function mapHotspotFlows(hotspot: unknown): SonarIssueLocation[][] {
  const payload = asRecord(hotspot);
  const flows = arrayField(payload, "flows");
  const mappedFlows: SonarIssueLocation[][] = [];

  for (const flow of flows) {
    const flowPayload = asRecord(flow);
    mappedFlows.push(arrayField(flowPayload, "locations").map(mapLocationPayload));
  }

  return mappedFlows;
}

function isNonReviewHotspotStatus(status: string | undefined): boolean {
  if (!status) return false;

  return NON_REVIEW_HOTSPOT_STATUSES.has(normalizeHotspotSignal(status));
}

function isNonReviewHotspotResolution(resolution: string | undefined): boolean {
  if (!resolution) return false;

  return NON_REVIEW_HOTSPOT_RESOLUTIONS.has(normalizeHotspotSignal(resolution));
}

function normalizeHotspotSignal(value: string): string {
  return value.trim().toUpperCase().replaceAll(" ", "_");
}

function fileFromComponent(component: string): string | undefined {
  const separatorIndex = component.indexOf(":");
  if (separatorIndex === -1) return undefined;

  return component.slice(separatorIndex + 1);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function identifierField(record: Record<string, unknown>, key: string): string | undefined {
  return safeSonarString(record[key], SONAR_IDENTIFIER_TEXT_MAX_CHARS);
}

function mediumStringField(record: Record<string, unknown>, key: string): string | undefined {
  return safeSonarString(record[key], SONAR_MEDIUM_TEXT_MAX_CHARS);
}

function longStringField(record: Record<string, unknown>, key: string): string | undefined {
  return safeSonarString(record[key], SONAR_LONG_TEXT_MAX_CHARS);
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
