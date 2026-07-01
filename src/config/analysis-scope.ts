import { readFile } from "node:fs/promises";

import { SONAR_ENV_VARS } from "../constants.ts";
import type { AnalysisScopeResolution, AnalysisScopeResolutionOptions } from "./types.ts";
import { AnalyseMeConfigError } from "./types.ts";

interface GithubScopeCandidate {
  branch?: string;
  pullRequest?: string;
}

export async function resolveAnalysisScope(
  options: AnalysisScopeResolutionOptions = {},
): Promise<AnalysisScopeResolution> {
  const explicitBranch = normalizeScopeValue(options.explicitBranch);
  const explicitPullRequest = normalizeScopeValue(options.explicitPullRequest);

  assertSingleScope(explicitBranch, explicitPullRequest, "Tool arguments");

  if (explicitBranch) return { scope: { kind: "branch", branch: explicitBranch }, source: "argument" };
  if (explicitPullRequest) {
    return { scope: { kind: "pullRequest", pullRequest: explicitPullRequest }, source: "argument" };
  }

  const configuredBranch = normalizeScopeValue(options.configuredBranch);
  const configuredPullRequest = normalizeScopeValue(options.configuredPullRequest);

  assertSingleScope(configuredBranch, configuredPullRequest, "Configured analysis scope");

  if (configuredBranch) {
    return { scope: { kind: "branch", branch: configuredBranch }, source: SONAR_ENV_VARS.branch };
  }

  if (configuredPullRequest) {
    return {
      scope: { kind: "pullRequest", pullRequest: configuredPullRequest },
      source: SONAR_ENV_VARS.pullRequest,
    };
  }

  const githubScope = await resolveGithubActionsScope(options.env ?? process.env);

  if (githubScope.pullRequest) {
    return { scope: { kind: "pullRequest", pullRequest: githubScope.pullRequest }, source: "github-actions" };
  }

  if (githubScope.branch) {
    return { scope: { kind: "branch", branch: githubScope.branch }, source: "github-actions" };
  }

  return { scope: { kind: "none" }, source: "none" };
}

export function formatAnalysisScope(scope: AnalysisScopeResolution): string {
  if (scope.scope.kind === "branch") return `branch ${scope.scope.branch}`;
  if (scope.scope.kind === "pullRequest") return `pull request ${scope.scope.pullRequest}`;

  return "default project scope";
}

async function resolveGithubActionsScope(env: NodeJS.ProcessEnv): Promise<GithubScopeCandidate> {
  const eventPullRequest = await readGithubEventPullRequest(env.GITHUB_EVENT_PATH);
  if (eventPullRequest) return { pullRequest: eventPullRequest };

  const parsedRefScope = parseGithubRef(env.GITHUB_REF);
  if (parsedRefScope.pullRequest) return parsedRefScope;

  const headRef = normalizeScopeValue(env.GITHUB_HEAD_REF);
  if (headRef) return { branch: headRef };

  const refName = normalizeScopeValue(env.GITHUB_REF_NAME);
  if (refName) return { branch: refName };

  if (parsedRefScope.branch) return parsedRefScope;

  return {};
}

async function readGithubEventPullRequest(eventPath: string | undefined): Promise<string | undefined> {
  const normalizedPath = normalizeScopeValue(eventPath);
  if (!normalizedPath) return undefined;

  try {
    const content = await readFile(normalizedPath, "utf8");
    return extractPullRequestNumber(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function extractPullRequestNumber(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const pullRequest = payload.pull_request;
  if (isRecord(pullRequest)) {
    return normalizePullRequestNumber(pullRequest.number);
  }

  return normalizePullRequestNumber(payload.number);
}

function parseGithubRef(ref: string | undefined): GithubScopeCandidate {
  const normalized = normalizeScopeValue(ref);
  if (!normalized) return {};

  if (normalized.startsWith("refs/heads/")) {
    return { branch: normalized.slice("refs/heads/".length) };
  }

  const pullRequestMatch = /^refs\/pull\/(\d+)\//.exec(normalized);
  if (pullRequestMatch?.[1]) return { pullRequest: pullRequestMatch[1] };

  return {};
}

function assertSingleScope(branch: string | undefined, pullRequest: string | undefined, label: string): void {
  if (!branch || !pullRequest) return;

  throw new AnalyseMeConfigError([
    `${label} provided both branch and pull request scope. Use ${SONAR_ENV_VARS.branch} or ${SONAR_ENV_VARS.pullRequest}, not both.`,
  ]);
}

function normalizePullRequestNumber(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value !== "string") return undefined;

  return normalizeScopeValue(value);
}

function normalizeScopeValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
