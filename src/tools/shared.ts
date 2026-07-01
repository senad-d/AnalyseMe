import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { resolveAnalysisScope } from "../config/analysis-scope.ts";
import { requireAnalyseMeConfig } from "../config/load-config.ts";
import { resolveProjectKey } from "../config/project-key.ts";
import type {
  AnalysisScopeResolution,
  ProjectKeySource,
  SonarConnectionConfig,
} from "../config/types.ts";
import { AnalyseMeConfigError } from "../config/types.ts";
import type { ProjectScopedEndpointOptions, SourceShowEndpointOptions } from "../sonar/endpoints.ts";

export interface ProjectScopedToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface ResolvedProjectToolContext {
  config: SonarConnectionConfig;
  projectKey: string;
  projectKeySource: ProjectKeySource;
  organization?: string;
  scope: AnalysisScopeResolution;
  endpointOptions: ProjectScopedEndpointOptions;
}

export interface OptionalProjectToolContext {
  config: SonarConnectionConfig;
  projectKey?: string;
  projectKeySource?: ProjectKeySource;
  organization?: string;
  scope: AnalysisScopeResolution;
}

export interface RenderableTextRange {
  startLine?: number;
  endLine?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface RenderableLocation {
  component?: string;
  file?: string;
  line?: number;
  textRange?: RenderableTextRange;
}

export interface SourceWindow {
  from: number;
  to: number;
}

export function normalizeProjectScopedToolInput<TInput extends ProjectScopedToolInput>(params: TInput): TInput {
  return {
    ...params,
    projectKey: normalizeOptionalToolString(params.projectKey),
    organization: normalizeOptionalToolString(params.organization),
    branch: normalizeOptionalToolString(params.branch),
    pullRequest: normalizeOptionalToolString(params.pullRequest),
  };
}

export function normalizeOptionalToolString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireNonEmptyToolString(value: string | undefined, fieldName: string, description: string): string {
  const normalized = normalizeOptionalToolString(value);
  if (normalized) return normalized;

  throw new Error(`${fieldName} is required and must be a non-empty string. Pass ${description}.`);
}

export async function resolveProjectToolContext(
  ctx: ExtensionContext,
  params: ProjectScopedToolInput,
): Promise<ResolvedProjectToolContext> {
  const normalizedParams = normalizeProjectScopedToolInput(params);
  const config = await requireAnalyseMeConfig({ cwd: ctx.cwd });
  const projectKeyResolution = await resolveProjectKey({
    cwd: ctx.cwd,
    explicitProjectKey: normalizedParams.projectKey,
    configuredProjectKey: config.projectKey,
  });

  if (!projectKeyResolution.projectKey) {
    throw new AnalyseMeConfigError([
      "Unable to resolve a Sonar project key. Pass projectKey, set SONARQUBE_PROJECT_KEY, or add sonar.projectKey to sonar-project.properties.",
    ]);
  }

  const scope = await resolveAnalysisScope({
    cwd: ctx.cwd,
    explicitBranch: normalizedParams.branch,
    explicitPullRequest: normalizedParams.pullRequest,
    configuredBranch: config.branch,
    configuredPullRequest: config.pullRequest,
  });
  const organization = normalizedParams.organization ?? config.organization;
  const endpointOptions = buildProjectScopedEndpointOptions(projectKeyResolution.projectKey, organization, scope);

  return {
    config,
    projectKey: projectKeyResolution.projectKey,
    projectKeySource: projectKeyResolution.source,
    organization,
    scope,
    endpointOptions,
  };
}

export async function resolveOptionalProjectToolContext(
  ctx: ExtensionContext,
  params: ProjectScopedToolInput,
): Promise<OptionalProjectToolContext> {
  const normalizedParams = normalizeProjectScopedToolInput(params);
  const config = await requireAnalyseMeConfig({ cwd: ctx.cwd });
  const projectKeyResolution = await resolveProjectKey({
    cwd: ctx.cwd,
    explicitProjectKey: normalizedParams.projectKey,
    configuredProjectKey: config.projectKey,
  });
  const scope = await resolveAnalysisScope({
    cwd: ctx.cwd,
    explicitBranch: normalizedParams.branch,
    explicitPullRequest: normalizedParams.pullRequest,
    configuredBranch: config.branch,
    configuredPullRequest: config.pullRequest,
  });

  return {
    config,
    projectKey: projectKeyResolution.projectKey,
    projectKeySource: projectKeyResolution.projectKey ? projectKeyResolution.source : undefined,
    organization: normalizedParams.organization ?? config.organization,
    scope,
  };
}

export function renderAnalysisScope(scopeResolution: AnalysisScopeResolution): string {
  if (scopeResolution.scope.kind === "branch") return `branch ${scopeResolution.scope.branch}`;
  if (scopeResolution.scope.kind === "pullRequest") return `pull request ${scopeResolution.scope.pullRequest}`;

  return "default project scope";
}

export function normalizePositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  const integer = Math.trunc(value);
  if (integer < 1) return fallback;

  return Math.min(integer, max);
}

export function buildScopeEndpointOptions(
  context: Pick<OptionalProjectToolContext, "organization" | "scope">,
): { organization?: string; branch?: string; pullRequest?: string } {
  if (context.scope.scope.kind === "branch") {
    return { organization: context.organization, branch: context.scope.scope.branch };
  }

  if (context.scope.scope.kind === "pullRequest") {
    return { organization: context.organization, pullRequest: context.scope.scope.pullRequest };
  }

  return { organization: context.organization };
}

export function buildSourceWindow(line: number): SourceWindow {
  return {
    from: Math.max(1, line - 3),
    to: line + 3,
  };
}

export function primaryLineFromPayload(record: Record<string, unknown>): number | undefined {
  const line = positiveNumberField(record, "line");
  if (line) return line;

  return positiveNumberField(asRecord(record.textRange), "startLine");
}

export function buildSourceShowEndpointOptions(
  componentKey: string,
  line: number,
  context: Pick<OptionalProjectToolContext, "organization" | "scope">,
): SourceShowEndpointOptions {
  return {
    componentKey,
    ...buildSourceWindow(line),
    ...buildScopeEndpointOptions(context),
  };
}

export function renderLocation(location: RenderableLocation): string {
  const component = location.component ?? "unavailable component";
  const file = location.file ? ` (${location.file})` : "";
  const line = location.line ? `:${location.line}` : "";
  const range = renderTextRange(location.textRange);

  return `${component}${file}${line}${range}`;
}

export function renderTextRange(textRange: RenderableTextRange | undefined): string {
  if (!textRange) return "";

  const startLine = textRange.startLine ?? "?";
  const endLine = textRange.endLine ?? startLine;
  const startOffset = textRange.startOffset ?? "?";
  const endOffset = textRange.endOffset ?? "?";

  return ` (range ${startLine}:${startOffset}-${endLine}:${endOffset})`;
}

export function buildSonarUiUrl(baseUrl: string, path: string, query: Record<string, string>): string | undefined {
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

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function positiveNumberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = numberField(record, key);
  return value && value > 0 ? value : undefined;
}

export function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildProjectScopedEndpointOptions(
  projectKey: string,
  organization: string | undefined,
  scopeResolution: AnalysisScopeResolution,
): ProjectScopedEndpointOptions {
  return {
    projectKey,
    ...buildScopeEndpointOptions({ organization, scope: scopeResolution }),
  };
}
