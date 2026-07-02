import {
  SONAR_IDENTIFIER_TEXT_MAX_CHARS,
  SONAR_LONG_TEXT_MAX_CHARS,
  SONAR_MEDIUM_TEXT_MAX_CHARS,
  safeSonarString,
  safeSonarText,
} from "../utils/text-safety.ts";
import type { AgentSourceSnippet, SonarLocation, SonarLocationMappingOptions } from "./location-mapping.ts";
import {
  mapSonarFlows,
  mapSonarLocationRecord,
  mapSonarSecondaryLocations,
  mapSourceSnippets,
} from "./location-mapping.ts";

export type SonarIssueLocation = SonarLocation;
export type { AgentSourceSnippet } from "./location-mapping.ts";
export { mapSourceSnippets } from "./location-mapping.ts";

export interface SonarIssueLike {
  status?: string;
  issueStatus?: string;
  resolution?: string;
  resolved?: boolean;
  falsePositive?: boolean;
  isFalsePositive?: boolean;
  accepted?: boolean;
  ignored?: boolean;
}

export interface AgentRuleMetadata {
  key?: string;
  name?: string;
  severity?: string;
  type?: string;
  cleanCodeAttribute?: string;
  tags: string[];
}

export interface AgentIssueSummary {
  key: string;
  message?: string;
  severity?: string;
  type?: string;
  status?: string;
  issueStatus?: string;
  resolution?: string;
  rule?: string;
  impacts: string[];
  location: SonarIssueLocation;
  tags: string[];
}

export interface AgentIssueDetail extends AgentIssueSummary {
  ruleName?: string;
  guidance?: string;
  ruleMetadata?: AgentRuleMetadata;
  sourceSnippets: AgentSourceSnippet[];
  secondaryLocations: SonarIssueLocation[];
  flows: SonarIssueLocation[][];
}

export interface SonarMappingInvalidRow {
  index: number;
  reason: string;
}

export interface IssueSummaryMappingResult {
  issues: AgentIssueSummary[];
  invalidRows: SonarMappingInvalidRow[];
  warnings: string[];
  rawRowCount: number;
}

export interface IssueSearchMappingResult extends IssueSummaryMappingResult {
  missingIssuesArray: boolean;
}

const NON_ACTIVE_ISSUE_STATUSES = new Set([
  "ACCEPTED",
  "CLOSED",
  "FALSE-POSITIVE",
  "FALSE_POSITIVE",
  "FIXED",
  "REMOVED",
  "RESOLVED",
  "WONTFIX",
  "WON'T_FIX",
]);

const NON_ACTIVE_ISSUE_RESOLUTIONS = new Set([
  "ACCEPTED",
  "FALSE-POSITIVE",
  "FALSE_POSITIVE",
  "FIXED",
  "REMOVED",
  "RESOLVED",
  "SAFE",
  "WONTFIX",
  "WON'T_FIX",
]);

/**
 * Active issue filtering is intentionally defensive across SonarQube and
 * SonarCloud versions. It excludes false-positive, ignored, accepted, resolved,
 * closed, or equivalent signals while keeping unknown/open-looking issues.
 */
export function isActiveSonarIssue(issue: SonarIssueLike): boolean {
  if (issue.resolved === true) return false;
  if (issue.falsePositive === true || issue.isFalsePositive === true) return false;
  if (issue.accepted === true || issue.ignored === true) return false;
  if (isNonActiveIssueStatus(issue.status)) return false;
  if (isNonActiveIssueStatus(issue.issueStatus)) return false;
  if (isNonActiveIssueResolution(issue.resolution)) return false;

  return true;
}

export function filterActiveSonarIssues<TIssue extends SonarIssueLike>(issues: TIssue[]): TIssue[] {
  return issues.filter(isActiveSonarIssue);
}

export function mapIssueSearchResponse(
  response: unknown,
  options: SonarLocationMappingOptions = {},
): AgentIssueSummary[] {
  return mapIssueSearchResponseWithDiagnostics(response, options).issues;
}

export function mapIssueSearchResponseWithDiagnostics(
  response: unknown,
  options: SonarLocationMappingOptions = {},
): IssueSearchMappingResult {
  const payload = asRecord(response);
  const issues = payload.issues;

  if (!Array.isArray(issues)) {
    return {
      issues: [],
      invalidRows: [],
      warnings: ["Sonar issue search response did not include an issues array; no issue rows were mapped."],
      rawRowCount: 0,
      missingIssuesArray: true,
    };
  }

  return {
    ...mapIssueSummariesWithDiagnostics(issues, options),
    missingIssuesArray: false,
  };
}

export function mapIssueSummariesWithDiagnostics(
  issues: unknown[],
  options: SonarLocationMappingOptions = {},
): IssueSummaryMappingResult {
  const mappedIssues: AgentIssueSummary[] = [];
  const invalidRows: SonarMappingInvalidRow[] = [];

  issues.forEach((issue, index) => {
    const validationError = validateIssueSummaryPayload(issue);

    if (validationError) {
      invalidRows.push({ index, reason: validationError });
      return;
    }

    mappedIssues.push(mapIssueSummary(issue, options));
  });

  return {
    issues: mappedIssues,
    invalidRows,
    warnings: buildIssueMappingWarnings(invalidRows),
    rawRowCount: issues.length,
  };
}

export function mapIssueSummary(
  issue: unknown,
  options: SonarLocationMappingOptions = {},
): AgentIssueSummary {
  const payload = asRecord(issue);

  return {
    key: requiredIssueKey(payload),
    message: mediumStringField(payload, "message"),
    severity: identifierField(payload, "severity"),
    type: identifierField(payload, "type"),
    status: identifierField(payload, "status"),
    issueStatus: identifierField(payload, "issueStatus"),
    resolution: identifierField(payload, "resolution"),
    rule: identifierField(payload, "rule"),
    impacts: mapIssueImpacts(payload.impacts),
    location: mapSonarLocationRecord(payload, options),
    tags: stringArrayField(payload, "tags"),
  };
}

export function mapIssueDetail(
  issue: unknown,
  rule: unknown = undefined,
  sourceResponse: unknown = undefined,
  options: SonarLocationMappingOptions = {},
): AgentIssueDetail {
  const summary = mapIssueSummary(issue, options);
  const rulePayload = asRecord(rule);

  return {
    ...summary,
    ruleName: mediumStringField(rulePayload, "name"),
    guidance: extractRuleGuidance(rulePayload),
    ruleMetadata: mapRuleMetadata(rulePayload),
    sourceSnippets: mapSourceSnippets(sourceResponse),
    secondaryLocations: mapSonarSecondaryLocations(issue, options),
    flows: mapSonarFlows(issue, options),
  };
}

export function extractRuleGuidance(rule: unknown): string | undefined {
  const payload = asRecord(rule);
  const sectionGuidance = extractDescriptionSections(payload);

  if (sectionGuidance) return sectionGuidance;

  return (
    longStringField(payload, "htmlDesc") ??
    longStringField(payload, "markdownDescription") ??
    longStringField(payload, "description") ??
    longStringField(payload, "mdDesc")
  );
}

function mapRuleMetadata(rule: Record<string, unknown>): AgentRuleMetadata | undefined {
  if (Object.keys(rule).length === 0) return undefined;

  return {
    key: identifierField(rule, "key"),
    name: mediumStringField(rule, "name"),
    severity: identifierField(rule, "severity"),
    type: identifierField(rule, "type"),
    cleanCodeAttribute: identifierField(rule, "cleanCodeAttribute"),
    tags: stringArrayField(rule, "tags"),
  };
}

function validateIssueSummaryPayload(issue: unknown): string | undefined {
  const payload = asRecord(issue);
  if (!identifierField(payload, "key")) return "missing non-empty issue key";

  return undefined;
}

function requiredIssueKey(payload: Record<string, unknown>): string {
  const key = identifierField(payload, "key");
  if (key) return key;

  throw new Error("Malformed Sonar issue payload: missing non-empty issue key.");
}

function buildIssueMappingWarnings(invalidRows: SonarMappingInvalidRow[]): string[] {
  if (invalidRows.length === 0) return [];

  return [
    `Skipped ${invalidRows.length} malformed Sonar issue row(s) because each issue must include a non-empty key for follow-up detail calls.`,
  ];
}

function mapIssueImpacts(value: unknown): string[] {
  const impacts = Array.isArray(value) ? value : [];
  const mappedImpacts: string[] = [];

  for (const impact of impacts) {
    const payload = asRecord(impact);
    const softwareQuality = identifierField(payload, "softwareQuality");
    const severity = identifierField(payload, "severity");

    if (softwareQuality && severity) mappedImpacts.push(`${softwareQuality}:${severity}`);
    if (!softwareQuality && severity) mappedImpacts.push(severity);
  }

  return mappedImpacts;
}

function extractDescriptionSections(rule: Record<string, unknown>): string | undefined {
  const sections = arrayField(rule, "descriptionSections");
  const renderedSections: string[] = [];

  for (const section of sections) {
    const payload = asRecord(section);
    const key = identifierField(payload, "key");
    const content = longStringField(payload, "content");

    if (content && key) renderedSections.push(`${key}: ${content}`);
    if (content && !key) renderedSections.push(content);
  }

  return renderedSections.length > 0 ? safeSonarText(renderedSections.join("\n\n"), SONAR_LONG_TEXT_MAX_CHARS).text : undefined;
}

function isNonActiveIssueStatus(status: string | undefined): boolean {
  if (!status) return false;

  return NON_ACTIVE_ISSUE_STATUSES.has(normalizeIssueSignal(status));
}

function isNonActiveIssueResolution(resolution: string | undefined): boolean {
  if (!resolution) return false;

  return NON_ACTIVE_ISSUE_RESOLUTIONS.has(normalizeIssueSignal(resolution));
}

function normalizeIssueSignal(value: string): string {
  return value.trim().toUpperCase().replaceAll(" ", "_");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const values = arrayField(record, key);
  const strings: string[] = [];

  for (const value of values) {
    const safeValue = safeSonarString(value, SONAR_IDENTIFIER_TEXT_MAX_CHARS);
    if (safeValue) strings.push(safeValue);
  }

  return strings;
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

