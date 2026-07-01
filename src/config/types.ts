import type { SONAR_ENV_VARS } from "../constants.ts";

export type SonarEnvVarName = (typeof SONAR_ENV_VARS)[keyof typeof SONAR_ENV_VARS];

export type ConfigValueSource = "environment" | "env-file" | "missing";

export type ProjectKeySource = "argument" | typeof SONAR_ENV_VARS.projectKey | "sonar-project.properties" | "missing";

export type AnalysisScopeSource =
  | "argument"
  | typeof SONAR_ENV_VARS.branch
  | typeof SONAR_ENV_VARS.pullRequest
  | "github-actions"
  | "none";

export interface LoadedConfigValue {
  value: string | undefined;
  source: ConfigValueSource;
}

export type LoadedConfigValues = Record<SonarEnvVarName, LoadedConfigValue>;

export interface EnvFileLoadResult {
  path: string;
  exists: boolean;
  loadedKeys: string[];
  warning?: string;
}

export interface SonarConnectionConfig {
  url: string;
  token: string;
  organization?: string;
  projectKey?: string;
  branch?: string;
  pullRequest?: string;
  sources: LoadedConfigValues;
  tokenDisplay: string;
  allowInsecureHttp: boolean;
}

export interface AnalyseMeConfigLoadResult {
  config?: SonarConnectionConfig;
  sources?: LoadedConfigValues;
  errors: string[];
  warnings: string[];
  envFile: EnvFileLoadResult;
}

export interface AnalyseMeConfigLoadOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  envFilePath?: string;
  readEnvFile?: boolean;
  tolerateFileReadErrors?: boolean;
}

export interface ProjectKeyResolutionOptions {
  cwd?: string;
  explicitProjectKey?: string;
  configuredProjectKey?: string;
  tolerateFileReadErrors?: boolean;
}

export interface GitRemoteDiagnostic {
  name: string;
  url: string;
  repositoryNameSuggestion?: string;
}

export interface GitDiagnostics {
  configPath: string;
  exists: boolean;
  remotes: GitRemoteDiagnostic[];
  warnings: string[];
}

export interface ProjectKeyResolution {
  projectKey?: string;
  source: ProjectKeySource;
  gitDiagnostics: GitDiagnostics;
  warnings: string[];
}

export interface AnalysisScopeResolutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  explicitBranch?: string;
  explicitPullRequest?: string;
  configuredBranch?: string;
  configuredPullRequest?: string;
}

export type AnalysisScope =
  | { kind: "none" }
  | { kind: "branch"; branch: string }
  | { kind: "pullRequest"; pullRequest: string };

export interface AnalysisScopeResolution {
  scope: AnalysisScope;
  source: AnalysisScopeSource;
}

export class AnalyseMeConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "AnalyseMeConfigError";
    this.issues = issues;
  }
}
