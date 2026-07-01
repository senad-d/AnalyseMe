import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES } from "../constants.ts";
import { buildComponentMeasuresEndpoint, buildProjectStatusEndpoint } from "../sonar/endpoints.ts";
import { createSonarClient } from "../sonar/client.ts";
import type { AgentProjectSummary } from "../sonar/project-mapping.ts";
import { mapProjectSummaryResponse } from "../sonar/project-mapping.ts";
import { summarizeSonarTextSafety } from "../utils/text-safety.ts";
import type { SonarTextSafetySummary } from "../utils/text-safety.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { renderAnalysisScope, resolveProjectToolContext } from "./shared.ts";

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
  textSafety: SonarTextSafetySummary;
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
  const resolvedContext = await resolveProjectToolContext(ctx, params);
  const projectStatusRequest = buildProjectStatusEndpoint(resolvedContext.endpointOptions);
  const measuresRequest = buildComponentMeasuresEndpoint(resolvedContext.endpointOptions);
  const client = createSonarClient(resolvedContext.config);
  const projectStatusResponse = await client.getJson<unknown>({ ...projectStatusRequest, signal });
  const measuresResponse = await client.getJson<unknown>({ ...measuresRequest, signal });
  const summary = mapProjectSummaryResponse(resolvedContext.projectKey, projectStatusResponse, measuresResponse);
  const scopeLabel = renderAnalysisScope(resolvedContext.scope);
  const textSafety = summarizeSonarTextSafety(summary);
  const rendered = renderProjectSummary(
    summary,
    resolvedContext.projectKeySource,
    resolvedContext.organization,
    scopeLabel,
  );
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      projectKey: resolvedContext.projectKey,
      projectKeySource: resolvedContext.projectKeySource,
      organization: resolvedContext.organization,
      scope: scopeLabel,
      summary,
      requests: {
        projectStatus: projectStatusRequest,
        measures: measuresRequest,
      },
      truncation: truncated.metadata,
      textSafety,
    },
  };
}

function renderProjectSummary(
  summary: AgentProjectSummary,
  projectKeySource: string,
  organization: string | undefined,
  scopeLabel: string,
): string {
  const lines = [
    `# AnalyseMe project summary: ${summary.projectKey}`,
    "",
    `- Project key source: ${projectKeySource}`,
    `- Organization: ${organization ?? "not set"}`,
    `- Scope: ${scopeLabel}`,
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

