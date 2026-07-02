import { SONAR_MEDIUM_TEXT_MAX_CHARS, safeSonarString } from "../utils/text-safety.ts";

export interface SonarTextRange {
  startLine?: number;
  endLine?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface SonarLocation {
  component?: string;
  file?: string;
  line?: number;
  textRange?: SonarTextRange;
}

export interface AgentSourceSnippet {
  component?: string;
  line?: number;
  text: string;
}

export interface SonarLocationMappingOptions {
  projectKey?: string;
}

const EXPLICIT_FILE_FIELDS = ["path", "file", "filePath", "componentPath"];

export function mapSonarLocation(value: unknown, options: SonarLocationMappingOptions = {}): SonarLocation {
  return mapSonarLocationRecord(asRecord(value), options);
}

export function mapSonarLocationRecord(
  payload: Record<string, unknown>,
  options: SonarLocationMappingOptions = {},
): SonarLocation {
  const textRange = mapSonarTextRange(payload.textRange);
  const component = mediumStringField(payload, "component");

  return {
    component,
    file: componentFileFromPayload(payload, component, options),
    line: numberField(payload, "line") ?? textRange?.startLine,
    textRange,
  };
}

export function mapSonarTextRange(value: unknown): SonarTextRange | undefined {
  const payload = asRecord(value);
  const startLine = numberField(payload, "startLine");
  const endLine = numberField(payload, "endLine");
  const startOffset = numberField(payload, "startOffset");
  const endOffset = numberField(payload, "endOffset");

  if (!startLine && !endLine && startOffset === undefined && endOffset === undefined) return undefined;

  return { startLine, endLine, startOffset, endOffset };
}

export function mapSonarSecondaryLocations(
  value: unknown,
  options: SonarLocationMappingOptions = {},
): SonarLocation[] {
  const payload = asRecord(value);
  return arrayField(payload, "secondaryLocations").map((location) => mapSonarLocation(location, options));
}

export function mapSonarFlows(value: unknown, options: SonarLocationMappingOptions = {}): SonarLocation[][] {
  const payload = asRecord(value);
  const flows = arrayField(payload, "flows");
  const mappedFlows: SonarLocation[][] = [];

  for (const flow of flows) {
    const flowPayload = asRecord(flow);
    mappedFlows.push(arrayField(flowPayload, "locations").map((location) => mapSonarLocation(location, options)));
  }

  return mappedFlows;
}

export function mapSourceSnippets(sourceResponse: unknown): AgentSourceSnippet[] {
  const payload = asRecord(sourceResponse);
  const issueSnippets = arrayField(payload, "issueSnippets");
  const snippets = issueSnippets.length > 0 ? issueSnippets : arrayField(payload, "sources");

  if (snippets.length === 0) return mapFlatSourceLines(payload);

  return snippets.flatMap(mapSourceSnippetGroup);
}

export function componentFileFromPayload(
  payload: Record<string, unknown>,
  component: string | undefined,
  options: SonarLocationMappingOptions = {},
): string | undefined {
  const explicitPath = explicitFilePathField(payload);
  if (explicitPath) return explicitPath;
  if (!component) return undefined;

  return fileFromSonarComponent(component, options);
}

export function fileFromSonarComponent(
  component: string,
  options: SonarLocationMappingOptions = {},
): string | undefined {
  const projectKey = normalizedProjectKey(options.projectKey);

  if (projectKey) {
    const projectPrefix = `${projectKey}:`;
    if (component.startsWith(projectPrefix) && component.length > projectPrefix.length) {
      return component.slice(projectPrefix.length);
    }
  }

  const separatorIndexes = colonIndexes(component);
  if (separatorIndexes.length === 1) return component.slice(separatorIndexes[0] + 1);
  if (separatorIndexes.length > 1) return undefined;

  return undefined;
}

function mapSourceSnippetGroup(value: unknown): AgentSourceSnippet[] {
  const payload = asRecord(value);
  const sources = arrayField(payload, "sources");
  const component = mediumStringField(payload, "component");

  if (sources.length === 0) {
    const text = sourceStringField(payload, "code") ?? sourceStringField(payload, "text");
    if (!text) return [];

    return [{ component, line: numberField(payload, "line"), text }];
  }

  return sources.map((source) => mapSourceLine(source, component));
}

function mapFlatSourceLines(payload: Record<string, unknown>): AgentSourceSnippet[] {
  return arrayField(payload, "source").map((source) => mapSourceLine(source, undefined));
}

function mapSourceLine(value: unknown, inheritedComponent: string | undefined): AgentSourceSnippet {
  const payload = asRecord(value);

  return {
    component: mediumStringField(payload, "component") ?? inheritedComponent,
    line: numberField(payload, "line"),
    text: sourceStringField(payload, "code") ?? sourceStringField(payload, "text") ?? "",
  };
}

function explicitFilePathField(payload: Record<string, unknown>): string | undefined {
  for (const key of EXPLICIT_FILE_FIELDS) {
    const value = mediumStringField(payload, key);
    if (value) return value;
  }

  return undefined;
}

function normalizedProjectKey(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function colonIndexes(value: string): number[] {
  const indexes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === ":") indexes.push(index);
  }

  return indexes;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function mediumStringField(record: Record<string, unknown>, key: string): string | undefined {
  return safeSonarString(record[key], SONAR_MEDIUM_TEXT_MAX_CHARS);
}

function sourceStringField(record: Record<string, unknown>, key: string): string | undefined {
  return safeSonarString(record[key], SONAR_MEDIUM_TEXT_MAX_CHARS);
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
