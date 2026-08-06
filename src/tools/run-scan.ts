import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ANALYSEME_TOOL_NAMES, SONAR_SCANNER_PATH_ENV_VAR } from "../constants.ts";
import type { ScannerReportTask, ScannerResolution, ScannerRunResult } from "../scan/scanner.ts";
import {
  DEFAULT_SCAN_TIMEOUT_MS,
  MAX_SCAN_TIMEOUT_MS,
  ScannerNotFoundError,
  buildScannerArgs,
  buildScannerNotFoundMessage,
  detectScannerInstallOptions,
  readScannerReportTask,
  resolveScannerCommand,
  runScannerProcess,
  validateScannerProperties,
} from "../scan/scanner.ts";
import { throwIfAborted } from "../utils/abort.ts";
import { redactSecrets } from "../utils/mask.ts";
import { SONAR_LONG_TEXT_MAX_CHARS, sanitizeSonarText, summarizeSonarTextSafety } from "../utils/text-safety.ts";
import type { SonarTextSafetySummary } from "../utils/text-safety.ts";
import { truncateAnalyseMeText } from "../utils/truncation.ts";
import { normalizeOptionalToolString, renderAnalysisScope, resolveProjectToolContext } from "./shared.ts";
import type { ResolvedProjectToolContext } from "./shared.ts";

export interface RunScanToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  properties?: string[];
  waitForQualityGate?: boolean;
  timeoutSeconds?: number;
}

export interface RunScanLinks {
  dashboard?: string;
  ceTask?: string;
}

export interface RunScanExecution {
  exitCode: number | null;
  signalCode: string | null;
  timedOut: boolean;
  durationMs: number;
}

export interface RunScanLog {
  text: string;
  truncated: boolean;
  totalBytes: number;
}

export interface RunScanSummary {
  projectKey: string;
  projectKeySource: string;
  organization?: string;
  scope: string;
  scanner: ScannerResolution & { args: string[] };
  execution: RunScanExecution;
  succeeded: boolean;
  reportTask?: ScannerReportTask;
  links: RunScanLinks;
  log: RunScanLog;
  warnings: string[];
}

export interface RunScanDetails extends RunScanSummary {
  truncation: ReturnType<typeof truncateAnalyseMeText>["metadata"];
  truncated: boolean;
  textSafety: SonarTextSafetySummary;
}

const DEFAULT_SCAN_TIMEOUT_SECONDS = DEFAULT_SCAN_TIMEOUT_MS / 1000;
const MAX_SCAN_TIMEOUT_SECONDS = MAX_SCAN_TIMEOUT_MS / 1000;
const MIN_SCAN_TIMEOUT_SECONDS = 10;
const SCAN_LOG_TAIL_MAX_CHARS = SONAR_LONG_TEXT_MAX_CHARS;

const runScanParameters = Type.Object({
  projectKey: Type.Optional(
    Type.String({
      description:
        "Sonar project key to analyze. If omitted, AnalyseMe resolves SONARQUBE_PROJECT_KEY or sonar-project.properties sonar.projectKey.",
    }),
  ),
  organization: Type.Optional(
    Type.String({
      description: "Optional SonarCloud organization. Overrides SONARQUBE_ORGANIZATION for this call.",
    }),
  ),
  branch: Type.Optional(
    Type.String({
      description: "Optional Sonar branch analysis scope (sonar.branch.name). Mutually exclusive with pullRequest.",
    }),
  ),
  pullRequest: Type.Optional(
    Type.String({
      description: "Optional Sonar pull request analysis scope (sonar.pullrequest.key). Mutually exclusive with branch.",
    }),
  ),
  properties: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional extra scanner properties as key=value pairs, for example sonar.exclusions=**/dist/**. sonar.host.url, sonar.token, sonar.login, and sonar.password are managed by AnalyseMe and rejected.",
    }),
  ),
  waitForQualityGate: Type.Optional(
    Type.Boolean({
      description:
        "When true, the scanner waits for the server to process the analysis and fails the scan if the quality gate fails (sonar.qualitygate.wait=true). Defaults to false.",
    }),
  ),
  timeoutSeconds: Type.Optional(
    Type.Integer({
      minimum: MIN_SCAN_TIMEOUT_SECONDS,
      maximum: MAX_SCAN_TIMEOUT_SECONDS,
      description: `Maximum scan duration in seconds before the scanner process is stopped. Defaults to ${DEFAULT_SCAN_TIMEOUT_SECONDS}; max ${MAX_SCAN_TIMEOUT_SECONDS}.`,
    }),
  ),
});

export function registerRunScanTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ANALYSEME_TOOL_NAMES.runScan,
    label: "AnalyseMe Run Scan",
    description:
      "Run a local SonarScanner analysis of the current project and submit the results to the configured SonarQube/SonarCloud server.",
    promptSnippet: "Run a local SonarScanner analysis and submit the results to the configured Sonar server.",
    promptGuidelines: [
      "Use analyseme_run_scan when the user wants fresh Sonar analysis results for local changes; it runs the sonar-scanner CLI in the project directory and uploads the report to the configured Sonar server.",
      `analyseme_run_scan requires the sonar-scanner CLI on PATH or ${SONAR_SCANNER_PATH_ENV_VAR}; it submits a new analysis but never changes Sonar issues, hotspot status, settings, or repository files.`,
      "After analyseme_run_scan succeeds, the server processes the analysis asynchronously; wait for the reported CE task to finish (or pass waitForQualityGate) before reading results with analyseme_get_project_summary or analyseme_list_issues.",
      "When analyseme_run_scan reports that the scanner is missing, relay the suggested install command for this system and offer to run it for the user (ask before installing), then retry the scan.",
    ],
    parameters: runScanParameters,
    executionMode: "sequential",
    execute: executeRunScanTool,
  });
}

export async function executeRunScanTool(
  _toolCallId: string,
  params: RunScanToolInput,
  signal: AbortSignal | undefined,
  _onUpdate: unknown,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: RunScanDetails }> {
  const resolvedContext = await resolveProjectToolContext(ctx, params);
  const properties = validateScannerProperties(normalizeProperties(params.properties));
  const scanner = resolveScannerCommand();
  const args = buildScannerArgs({
    projectKey: resolvedContext.projectKey,
    organization: resolvedContext.organization,
    branch: scopeBranch(resolvedContext),
    pullRequest: scopePullRequest(resolvedContext),
    waitForQualityGate: params.waitForQualityGate === true,
    properties,
  });
  const timeoutMs = normalizeTimeoutSeconds(params.timeoutSeconds) * 1000;
  const runResult = await runScannerProcess({
    command: scanner.command,
    args,
    cwd: ctx.cwd,
    env: buildScannerEnv(resolvedContext),
    timeoutMs,
    signal,
  }).catch(async (error: unknown) => {
    if (!(error instanceof ScannerNotFoundError)) throw error;

    throw new Error(buildScannerNotFoundMessage(scanner.command, await detectScannerInstallOptions()));
  });

  throwIfAborted(signal);

  const reportTaskResult = await readScannerReportTask(ctx.cwd);
  const succeeded = runResult.exitCode === 0;
  const warnings = succeeded ? [...reportTaskResult.warnings] : [];
  const log = buildRunScanLog(runResult, resolvedContext.config.token);
  const summary: RunScanSummary = {
    projectKey: resolvedContext.projectKey,
    projectKeySource: resolvedContext.projectKeySource,
    organization: resolvedContext.organization,
    scope: renderAnalysisScope(resolvedContext.scope),
    scanner: { ...scanner, args },
    execution: {
      exitCode: runResult.exitCode,
      signalCode: runResult.signalCode,
      timedOut: runResult.timedOut,
      durationMs: runResult.durationMs,
    },
    succeeded,
    reportTask: succeeded ? reportTaskResult.reportTask : undefined,
    links: succeeded ? buildRunScanLinks(reportTaskResult.reportTask) : {},
    log,
    warnings,
  };
  const rendered = renderRunScan(summary, params.waitForQualityGate === true);
  const truncated = truncateAnalyseMeText(rendered);

  return {
    content: [{ type: "text", text: truncated.text }],
    details: {
      ...summary,
      truncation: truncated.metadata,
      truncated: truncated.metadata.truncated,
      textSafety: summarizeSonarTextSafety({ log: log.text, warnings }),
    },
  };
}

function normalizeProperties(properties: string[] | undefined): string[] {
  if (!Array.isArray(properties)) return [];

  return properties
    .map((property) => normalizeOptionalToolString(property))
    .filter((property): property is string => property !== undefined);
}

function normalizeTimeoutSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SCAN_TIMEOUT_SECONDS;

  const seconds = Math.trunc(value);
  if (seconds < MIN_SCAN_TIMEOUT_SECONDS) return MIN_SCAN_TIMEOUT_SECONDS;

  return Math.min(seconds, MAX_SCAN_TIMEOUT_SECONDS);
}

/**
 * The Sonar URL and token are passed only through the scanner environment,
 * never on the command line, so they cannot leak through process listings or
 * rendered command output.
 */
function buildScannerEnv(context: ResolvedProjectToolContext): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SONAR_HOST_URL: context.config.url,
    SONAR_TOKEN: context.config.token,
  };
}

function scopeBranch(context: ResolvedProjectToolContext): string | undefined {
  return context.scope.scope.kind === "branch" ? context.scope.scope.branch : undefined;
}

function scopePullRequest(context: ResolvedProjectToolContext): string | undefined {
  return context.scope.scope.kind === "pullRequest" ? context.scope.scope.pullRequest : undefined;
}

function buildRunScanLog(runResult: ScannerRunResult, token: string): RunScanLog {
  const sanitized = redactSecrets(sanitizeSonarText(runResult.log), [token]).trim();
  const tailTruncated = sanitized.length > SCAN_LOG_TAIL_MAX_CHARS;
  const text = tailTruncated ? sanitized.slice(sanitized.length - SCAN_LOG_TAIL_MAX_CHARS) : sanitized;

  return {
    text,
    truncated: runResult.logTruncated || tailTruncated,
    totalBytes: runResult.logBytesTotal,
  };
}

function buildRunScanLinks(reportTask: ScannerReportTask | undefined): RunScanLinks {
  return {
    dashboard: reportTask?.dashboardUrl,
    ceTask: reportTask?.ceTaskUrl,
  };
}

function renderRunScan(details: RunScanSummary, waitForQualityGate: boolean): string {
  const lines = [
    `# AnalyseMe scan: ${details.projectKey}`,
    "",
    `- Project key source: ${details.projectKeySource}`,
    `- Organization: ${details.organization ?? "not set"}`,
    `- Scope: ${details.scope}`,
    `- Scanner: ${details.scanner.command} (${details.scanner.source === "environment" ? SONAR_SCANNER_PATH_ENV_VAR : "PATH"})`,
    `- Outcome: ${renderOutcome(details)}`,
    `- Duration: ${renderDuration(details.execution.durationMs)}`,
    `- Quality gate wait: ${waitForQualityGate ? "enabled" : "disabled"}`,
  ];

  appendSuccessfulRunDetails(lines, details, waitForQualityGate);
  appendRunScanLog(lines, details.log);
  appendRunScanWarnings(lines, details.warnings);

  return lines.join("\n");
}

function appendSuccessfulRunDetails(
  lines: string[],
  details: RunScanSummary,
  waitForQualityGate: boolean,
): void {
  if (!details.succeeded) return;

  lines.push(`- Analysis upload: ${details.reportTask ? "confirmed" : "not confirmed"}`);

  if (details.links.dashboard) lines.push(`- Dashboard: ${details.links.dashboard}`);
  if (details.reportTask?.ceTaskId) lines.push(`- CE task id: ${details.reportTask.ceTaskId}`);
  if (details.links.ceTask) lines.push(`- CE task: ${details.links.ceTask}`);
  if (!waitForQualityGate) {
    lines.push("- Note: the server processes the analysis asynchronously; read fresh results after the CE task completes.");
  }
}

function appendRunScanLog(lines: string[], log: RunScanLog): void {
  lines.push("", "## Scanner log (tail)", "");

  if (log.text.length === 0) {
    lines.push("- The scanner produced no output.");
  } else {
    lines.push("```text", log.text, "```");
  }

  if (log.truncated) {
    lines.push("", `[AnalyseMe scanner log truncated: showing the tail of ${log.totalBytes} bytes.]`);
  }
}

function appendRunScanWarnings(lines: string[], warnings: string[]): void {
  if (warnings.length === 0) return;

  lines.push("", "## Warnings");

  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }
}

function renderOutcome(details: RunScanSummary): string {
  if (details.execution.timedOut) {
    return `timed out and was stopped (exit code ${details.execution.exitCode ?? "none"}, signal ${details.execution.signalCode ?? "none"})`;
  }

  if (details.succeeded) return "success";

  if (details.execution.exitCode === null) {
    return `stopped by signal ${details.execution.signalCode ?? "unknown"}`;
  }

  return `failed (exit code ${details.execution.exitCode})`;
}

function renderDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}
