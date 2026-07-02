import {
  SONAR_IDENTIFIER_TEXT_MAX_CHARS,
  SONAR_LONG_TEXT_MAX_CHARS,
  SONAR_MEDIUM_TEXT_MAX_CHARS,
  safeSonarString,
} from "../utils/text-safety.ts";
import type { AgentSourceSnippet, SonarLocation, SonarLocationMappingOptions } from "./location-mapping.ts";
import {
  mapSonarFlows,
  mapSonarLocationRecord,
  mapSonarSecondaryLocations,
  mapSourceSnippets,
} from "./location-mapping.ts";

type SonarIssueLocation = SonarLocation;

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

export function mapHotspotSearchResponse(
  response: unknown,
  options: SonarLocationMappingOptions = {},
): AgentSecurityHotspotSummary[] {
  return mapHotspotSearchResponseWithDiagnostics(response, options).hotspots;
}

export function mapHotspotSearchResponseWithDiagnostics(
  response: unknown,
  options: SonarLocationMappingOptions = {},
): HotspotSearchMappingResult {
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
    ...mapSecurityHotspotSummariesWithDiagnostics(hotspots, options),
    missingHotspotsArray: false,
  };
}

export function mapSecurityHotspotSummariesWithDiagnostics(
  hotspots: unknown[],
  options: SonarLocationMappingOptions = {},
): HotspotSummaryMappingResult {
  const mappedHotspots: AgentSecurityHotspotSummary[] = [];
  const invalidRows: SonarMappingInvalidRow[] = [];

  hotspots.forEach((hotspot, index) => {
    const validationError = validateSecurityHotspotSummaryPayload(hotspot);

    if (validationError) {
      invalidRows.push({ index, reason: validationError });
      return;
    }

    mappedHotspots.push(mapSecurityHotspotSummary(hotspot, options));
  });

  return {
    hotspots: mappedHotspots,
    invalidRows,
    warnings: buildHotspotMappingWarnings(invalidRows),
    rawRowCount: hotspots.length,
  };
}

export function mapSecurityHotspotSummary(
  hotspot: unknown,
  options: SonarLocationMappingOptions = {},
): AgentSecurityHotspotSummary {
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
    location: mapSonarLocationRecord(payload, options),
    createdAt: identifierField(payload, "creationDate") ?? identifierField(payload, "createdAt"),
    updatedAt: identifierField(payload, "updateDate") ?? identifierField(payload, "updatedAt"),
  };
}

export function mapSecurityHotspotDetail(
  hotspot: unknown,
  sourceResponse: unknown = undefined,
  options: SonarLocationMappingOptions = {},
): AgentSecurityHotspotDetail {
  const summary = mapSecurityHotspotSummary(hotspot, options);

  return {
    ...summary,
    guidance: extractHotspotGuidance(hotspot),
    sourceSnippets: mapSourceSnippets(sourceResponse),
    secondaryLocations: mapSonarSecondaryLocations(hotspot, options),
    flows: mapSonarFlows(hotspot, options),
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
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

