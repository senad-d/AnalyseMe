import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { resolveAnalysisScope } from "../config/analysis-scope.ts";
import { requireAnalyseMeConfig } from "../config/load-config.ts";
import { resolveProjectKey } from "../config/project-key.ts";
import type { AnalysisScopeResolution } from "../config/types.ts";
import { AnalyseMeConfigError } from "../config/types.ts";
import { buildComponentMeasuresEndpoint, buildProjectStatusEndpoint } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { AgentProjectSummary } from "../sonar/project-mapping.ts";
import { mapProjectSummaryResponse } from "../sonar/project-mapping.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";

export interface ProjectSummaryToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface ProjectSummaryDetails {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  summary: AgentProjectSummary;
  requests: {
    projectStatus: ReturnType<typeof buildProjectStatusEndpoint>;
    measures: ReturnType<typeof buildComponentMeasuresEndpoint>;
  };
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
}

const projectSummaryParameters = Type.Object({
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
});

export function registerProjectSummaryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.getProjectSummary,
    label: "AnalyseMe Project Summary",
    description: "Read SonarQube/SonarCloud quality gate and project summary metrics without mutating Sonar state.",
    promptSnippet: "Read SonarQube/SonarCloud project quality gate and summary metrics.",
    promptGuidelines: [
      "Use analyseme_get_project_summary before broad Sonar issue triage to understand project quality gate and metric context.",
      "analyseme_get_project_summary is read-only and never changes Sonar issues, projects, or configuration.",
      "When analyseme_get_project_summary omits projectKey, it resolves the key from SONARQUBE_PROJECT_KEY or sonar-project.properties.",
    ],
    parameters: projectSummaryParameters,
    execute: executeProjectSummaryTool,
  });
}

export async function executeProjectSummaryTool(
  _toolCallId: string,
  params: ProjectSummaryToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: ProjectSummaryDetails }> {
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

  const scopeResolution = await resolveAnalysisScope({
    cwd: ctx.cwd,
    explicitBranch: params.branch,
    explicitPullRequest: params.pullRequest,
    configuredBranch: config.branch,
    configuredPullRequest: config.pullRequest,
  });
  const organization = normalizeOptionalText(params.organization) ?? config.organization;
  const endpointOptions = buildProjectEndpointOptions(projectKeyResolution.projectKey, organization, scopeResolution);
  const projectStatusRequest = buildProjectStatusEndpoint(endpointOptions);
  const measuresRequest = buildComponentMeasuresEndpoint(endpointOptions);
  const client = createSonarClient(config);
  const projectStatusResponse = await client.getJson<unknown>({ ...projectStatusRequest, signal });
  const measuresResponse = await client.getJson<unknown>({ ...measuresRequest, signal });
  const summary = mapProjectSummaryResponse(projectKeyResolution.projectKey, projectStatusResponse, measuresResponse);
  const rendered = renderProjectSummary(summary, projectKeyResolution.source, organization, scopeResolution);
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      projectKey: projectKeyResolution.projectKey,
      projectKeySource: projectKeyResolution.source,
      organization,
      scope: renderScope(scopeResolution),
      summary,
      requests: {
        projectStatus: projectStatusRequest,
        measures: measuresRequest,
      },
      truncation: truncated.metadata,
    },
  };
}

function buildProjectEndpointOptions(
  projectKey: string,
  organization: string | undefined,
  scopeResolution: AnalysisScopeResolution,
): { projectKey: string; organization?: string; branch?: string; pullRequest?: string } {
  if (scopeResolution.scope.kind === "branch") {
    return { projectKey, organization, branch: scopeResolution.scope.branch };
  }

  if (scopeResolution.scope.kind === "pullRequest") {
    return { projectKey, organization, pullRequest: scopeResolution.scope.pullRequest };
  }

  return { projectKey, organization };
}

function renderProjectSummary(
  summary: AgentProjectSummary,
  projectKeySource: string,
  organization: string | undefined,
  scopeResolution: AnalysisScopeResolution,
): string {
  const lines = [
    `# AnalyseMe project summary: ${summary.projectKey}`,
    "",
    `- Project key source: ${projectKeySource}`,
    `- Organization: ${organization ?? "not set"}`,
    `- Scope: ${renderScope(scopeResolution)}`,
    `- Quality gate: ${summary.qualityGateStatus ?? "unavailable"}`,
  ];

  if (summary.analysisDate) lines.push(`- Analysis date: ${summary.analysisDate}`);

  lines.push("", "## Metrics");

  if (summary.metrics.length === 0) lines.push("- No metrics returned by Sonar.");

  for (const metric of summary.metrics) {
    lines.push(`- ${metric.key}: ${metric.value ?? "unavailable"}`);
  }

  if (summary.warnings.length > 0) {
    lines.push("", "## Warnings");

    for (const warning of summary.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function renderScope(scopeResolution: AnalysisScopeResolution): string {
  if (scopeResolution.scope.kind === "branch") return `branch ${scopeResolution.scope.branch}`;
  if (scopeResolution.scope.kind === "pullRequest") return `pull request ${scopeResolution.scope.pullRequest}`;

  return "default project scope";
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
