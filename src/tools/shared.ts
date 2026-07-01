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
import type { ProjectScopedEndpointOptions } from "../sonar/endpoints.ts";

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

export async function resolveProjectToolContext(
  ctx: ExtensionContext,
  params: ProjectScopedToolInput,
): Promise<ResolvedProjectToolContext> {
  const config = await requireAnalyseMeConfig({ cwd: ctx.cwd });
  const projectKeyResolution = await resolveProjectKey({
    cwd: ctx.cwd,
    explicitProjectKey: params.projectKey,
    configuredProjectKey: config.projectKey,
  });

  if (!projectKeyResolution.projectKey) {
    throw new AnalyseMeConfigError([
      "Unable to resolve a Sonar project key. Pass projectKey, set SONARQUBE_PROJECT_KEY, or add sonar.projectKey to sonar-project.properties.",
    ]);
  }

  const scope = await resolveAnalysisScope({
    cwd: ctx.cwd,
    explicitBranch: params.branch,
    explicitPullRequest: params.pullRequest,
    configuredBranch: config.branch,
    configuredPullRequest: config.pullRequest,
  });
  const organization = normalizeOptionalText(params.organization) ?? config.organization;
  const endpointOptions = buildEndpointOptions(projectKeyResolution.projectKey, organization, scope);

  return {
    config,
    projectKey: projectKeyResolution.projectKey,
    projectKeySource: projectKeyResolution.source,
    organization,
    scope,
    endpointOptions,
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

function buildEndpointOptions(
  projectKey: string,
  organization: string | undefined,
  scopeResolution: AnalysisScopeResolution,
): ProjectScopedEndpointOptions {
  if (scopeResolution.scope.kind === "branch") {
    return { projectKey, organization, branch: scopeResolution.scope.branch };
  }

  if (scopeResolution.scope.kind === "pullRequest") {
    return { projectKey, organization, pullRequest: scopeResolution.scope.pullRequest };
  }

  return { projectKey, organization };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
