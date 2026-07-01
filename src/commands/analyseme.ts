import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import {
  ANALYSEME_COMMAND,
  ANALYSEME_TOOL_NAMES,
  SONAR_ALLOW_INSECURE_HTTP_ENV_VAR,
  SONAR_ENV_VARS,
} from "../constants.ts";
import { loadAnalyseMeConfig } from "../config/load-config.ts";
import { resolveProjectKey } from "../config/project-key.ts";
import { ConfigTuiComponent, buildConfigTuiModel, renderConfigTui } from "../ui/config-tui.ts";

export interface AnalyseMeCommandHelpSection {
  heading: string;
  body: string;
}

export interface AnalyseMeCommandState {
  mode: "help" | "config";
  sections: AnalyseMeCommandHelpSection[];
}

export interface AnalyseMeHelpDetails {
  command: string;
  tools: string[];
  readOnly: boolean;
}

export function registerAnalyseMeCommand(pi: ExtensionAPI): void {
  pi.registerCommand(ANALYSEME_COMMAND, {
    description: "Show AnalyseMe setup help or configuration status.",
    handler: async (args, ctx) => {
      await handleAnalyseMeCommand(pi, args, ctx);
    },
  });
}

export async function handleAnalyseMeCommand(
  pi: Pick<ExtensionAPI, "sendMessage">,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const normalizedArgs = args.trim().toLowerCase();

  if (normalizedArgs === "help" || normalizedArgs === "--help" || normalizedArgs === "-h") {
    sendAnalyseMeHelp(pi, ctx, normalizedArgs);
    return;
  }

  if (normalizedArgs.length > 0) {
    sendAnalyseMeHelp(pi, ctx, normalizedArgs);
    return;
  }

  const configResult = await loadAnalyseMeConfig({ cwd: ctx.cwd, tolerateFileReadErrors: true });
  const sources = configResult.config?.sources ?? configResult.sources;
  const projectKey = await resolveProjectKey({
    cwd: ctx.cwd,
    configuredProjectKey: sources?.[SONAR_ENV_VARS.projectKey]?.value,
    tolerateFileReadErrors: true,
  });
  const model = buildConfigTuiModel(withStatusWarnings(configResult, projectKey.warnings), { projectKey });

  if (ctx.mode === "tui") {
    await showAnalyseMeConfigTui(ctx, model);
    return;
  }

  const width = resolveRenderWidth();
  const content = renderConfigTui(model, width).join("\n");

  sendAnalyseMeMessage(pi, ctx, "analyseme-config", content, {
    command: "/analyseme",
    readOnly: true,
    lineCount: content.split("\n").length,
  });
}

async function showAnalyseMeConfigTui(
  ctx: ExtensionCommandContext,
  model: ReturnType<typeof buildConfigTuiModel>,
): Promise<void> {
  await ctx.ui.custom<void>((_tui, _theme, _keybindings, done) => {
    return new ConfigTuiComponent(model, () => done(undefined));
  });
}

function withStatusWarnings(
  result: Awaited<ReturnType<typeof loadAnalyseMeConfig>>,
  warnings: string[],
): Awaited<ReturnType<typeof loadAnalyseMeConfig>> {
  if (warnings.length === 0) return result;

  return { ...result, warnings: [...result.warnings, ...warnings] };
}

function sendAnalyseMeHelp(
  pi: Pick<ExtensionAPI, "sendMessage">,
  ctx: ExtensionCommandContext,
  normalizedArgs: string,
): void {
  const helpText = buildAnalyseMeHelpText(normalizedArgs);

  sendAnalyseMeMessage(pi, ctx, "analyseme-help", helpText, buildHelpDetails());
}

function sendAnalyseMeMessage(
  pi: Pick<ExtensionAPI, "sendMessage">,
  ctx: ExtensionCommandContext,
  customType: string,
  content: string,
  details: unknown,
): void {
  if (ctx.mode === "print") {
    process.stdout.write(`${content}\n`);
    return;
  }

  pi.sendMessage(
    {
      customType,
      content,
      display: true,
      details,
    },
    { triggerTurn: false },
  );
}

export function buildAnalyseMeHelpText(args: string = "help"): string {
  const heading = args.length > 0 && args !== "help" ? `# AnalyseMe help\n\nUnknown argument: ${args}\n` : "# AnalyseMe help";

  return [
    heading,
    "",
    "AnalyseMe reads SonarQube/SonarCloud analysis data for Pi agents. It is read-only: it never changes Sonar issues, hotspot status, assignees, comments, project settings, repository files, or `.env`.",
    "",
    "## Required configuration",
    "",
    `- ${SONAR_ENV_VARS.url}: SonarQube/SonarCloud base URL, for example \`https://sonarcloud.io\`. HTTPS is required by default.`,
    `- ${SONAR_ENV_VARS.token}: Sonar API token. AnalyseMe masks this value and never prints it.`,
    "",
    "## Optional configuration",
    "",
    `- ${SONAR_ENV_VARS.organization}: SonarCloud organization when required.`,
    `- ${SONAR_ENV_VARS.projectKey}: default project key when no tool projectKey is passed.`,
    `- ${SONAR_ENV_VARS.branch}: branch analysis scope. Mutually exclusive with ${SONAR_ENV_VARS.pullRequest}.`,
    `- ${SONAR_ENV_VARS.pullRequest}: pull request analysis scope. Mutually exclusive with ${SONAR_ENV_VARS.branch}.`,
    `- ${SONAR_ALLOW_INSECURE_HTTP_ENV_VAR}=true: explicit local/trusted-development opt-in for non-TLS \`http://\` Sonar URLs. Tokens can be exposed on the network; prefer HTTPS.`,
    "",
    "Project key resolution order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`. `.git/config` remote names are diagnostics only.",
    "",
    "Analysis scope resolution order: explicit tool argument, `SONARQUBE_BRANCH`/`SONARQUBE_PULL_REQUEST`, then GitHub Actions context (`GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GITHUB_REF`, `GITHUB_EVENT_PATH`).",
    "",
    "## Local `.env` example",
    "",
    "```bash",
    `${SONAR_ENV_VARS.url}="https://sonarcloud.io"`,
    `${SONAR_ENV_VARS.token}="replace-with-local-token"`,
    `${SONAR_ENV_VARS.organization}="your-organization"`,
    `${SONAR_ENV_VARS.projectKey}="your-project-key"`,
    "```",
    "",
    "## GitHub Actions example",
    "",
    "```yaml",
    "env:",
    `  ${SONAR_ENV_VARS.url}: \${{ secrets.SONARQUBE_URL }}`,
    `  ${SONAR_ENV_VARS.token}: \${{ secrets.SONARQUBE_TOKEN }}`,
    `  ${SONAR_ENV_VARS.organization}: \${{ secrets.SONARQUBE_ORGANIZATION }}`,
    `  ${SONAR_ENV_VARS.projectKey}: \${{ vars.SONARQUBE_PROJECT_KEY }}`,
    `  ${SONAR_ENV_VARS.branch}: \${{ github.ref_name }}`,
    "```",
    "",
    "## Tools",
    "",
    `- ${ANALYSEME_TOOL_NAMES.getProjectSummary}: project quality gate and summary metrics. Inputs: optional projectKey, organization, branch, pullRequest.`,
    `- ${ANALYSEME_TOOL_NAMES.listIssues}: active actionable issues only. Inputs: optional projectKey, organization, branch, pullRequest, limit, page.`,
    `- ${ANALYSEME_TOOL_NAMES.getIssue}: one issue's location, flows, source snippets, and Sonar-provided rule guidance. Inputs: issueKey plus optional projectKey, organization, branch, pullRequest.`,
    `- ${ANALYSEME_TOOL_NAMES.listSecurityHotspots}: security hotspots requiring review. Inputs: optional projectKey, organization, branch, pullRequest, limit, page.`,
    `- ${ANALYSEME_TOOL_NAMES.getSecurityHotspot}: one hotspot's location, flows, source context, and Sonar-provided security guidance. Inputs: hotspotKey plus optional projectKey, organization, branch, pullRequest.`,
    "",
    "Use `/analyseme help` any time; it does not require credentials or network access.",
  ].join("\n");
}

function resolveRenderWidth(): number {
  return process.stdout.columns ?? 80;
}

function buildHelpDetails(): AnalyseMeHelpDetails {
  return {
    command: "/analyseme help",
    tools: [
      ANALYSEME_TOOL_NAMES.getProjectSummary,
      ANALYSEME_TOOL_NAMES.listIssues,
      ANALYSEME_TOOL_NAMES.getIssue,
      ANALYSEME_TOOL_NAMES.listSecurityHotspots,
      ANALYSEME_TOOL_NAMES.getSecurityHotspot,
    ],
    readOnly: true,
  };
}
