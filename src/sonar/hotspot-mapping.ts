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
  const payload = asRecord(response);
  const hotspots = arrayField(payload, "hotspots");
  return hotspots.map(mapSecurityHotspotSummary);
}

export function mapSecurityHotspotSummary(hotspot: unknown): AgentSecurityHotspotSummary {
  const payload = asRecord(hotspot);

  return {
    key: stringField(payload, "key") ?? "unknown-hotspot",
    message: stringField(payload, "message"),
    status: stringField(payload, "status"),
    resolution: stringField(payload, "resolution"),
    vulnerabilityProbability: stringField(payload, "vulnerabilityProbability"),
    securityCategory: stringField(payload, "securityCategory"),
    assignee: stringField(payload, "assignee"),
    author: stringField(payload, "author"),
    location: mapHotspotLocation(payload),
    createdAt: stringField(payload, "creationDate") ?? stringField(payload, "createdAt"),
    updatedAt: stringField(payload, "updateDate") ?? stringField(payload, "updatedAt"),
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
    riskDescription: stringField(payload, "riskDescription") ?? stringField(rule, "riskDescription"),
    vulnerabilityDescription:
      stringField(payload, "vulnerabilityDescription") ?? stringField(rule, "vulnerabilityDescription"),
    fixRecommendation: stringField(payload, "fixRecommendation") ?? stringField(rule, "fixRecommendation"),
  };
}

function mapHotspotLocation(payload: Record<string, unknown>): SonarIssueLocation {
  const component = stringField(payload, "component");
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
  const component = stringField(payload, "component");
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

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
