import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DEFAULT_ENV_FILE_NAME,
  SONAR_ALLOW_INSECURE_HTTP_ENV_VAR,
  SONAR_ENV_VAR_NAMES,
  SONAR_ENV_VARS,
} from "../constants.ts";
import { maskSecretPresence } from "../utils/mask.ts";
import { isMissingFileError, localFileReadWarning } from "./file-errors.ts";
import type {
  AnalyseMeConfigLoadOptions,
  AnalyseMeConfigLoadResult,
  ConfigValueSource,
  EnvFileLoadResult,
  LoadedConfigValue,
  LoadedConfigValues,
  SonarConnectionConfig,
  SonarEnvVarName,
} from "./types.ts";
import { AnalyseMeConfigError } from "./types.ts";

interface ParsedEnvFile {
  values: Record<string, string>;
  result: EnvFileLoadResult;
}

interface RequiredFieldResult {
  value?: string;
  errors: string[];
  warnings: string[];
}

const EMPTY_ENV_FILE_VALUES: Record<string, string> = {};
const INSECURE_HTTP_WARNING = `${SONAR_ENV_VARS.url} uses non-TLS HTTP. Sonar tokens are sent without TLS because ${SONAR_ALLOW_INSECURE_HTTP_ENV_VAR}=true is enabled; use only for local or trusted development endpoints.`;

export async function loadAnalyseMeConfig(
  options: AnalyseMeConfigLoadOptions = {},
): Promise<AnalyseMeConfigLoadResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? join(cwd, DEFAULT_ENV_FILE_NAME);
  const parsedEnvFile = await loadOptionalEnvFile(
    envFilePath,
    options.readEnvFile ?? true,
    options.tolerateFileReadErrors ?? false,
  );
  const sources = collectConfigValues(env, parsedEnvFile.values);
  const allowInsecureHttp = resolveAllowInsecureHttp(env, parsedEnvFile.values);
  const warnings = parsedEnvFile.result.warning ? [parsedEnvFile.result.warning] : [];
  const errors: string[] = [];
  const urlField = validateRequiredUrl(sources[SONAR_ENV_VARS.url], allowInsecureHttp);
  const tokenField = validateRequiredText(SONAR_ENV_VARS.token, sources[SONAR_ENV_VARS.token]);

  errors.push(...urlField.errors, ...tokenField.errors);
  warnings.push(...urlField.warnings);
  errors.push(...validateConfiguredScope(sources));

  if (errors.length > 0 || !urlField.value || !tokenField.value) {
    return { sources, errors, warnings, envFile: parsedEnvFile.result };
  }

  return {
    sources,
    config: {
      url: urlField.value,
      token: tokenField.value,
      organization: sources[SONAR_ENV_VARS.organization].value,
      projectKey: sources[SONAR_ENV_VARS.projectKey].value,
      branch: sources[SONAR_ENV_VARS.branch].value,
      pullRequest: sources[SONAR_ENV_VARS.pullRequest].value,
      sources,
      tokenDisplay: maskSecretPresence(tokenField.value),
      allowInsecureHttp,
    },
    errors,
    warnings,
    envFile: parsedEnvFile.result,
  };
}

export async function requireAnalyseMeConfig(
  options: AnalyseMeConfigLoadOptions = {},
): Promise<SonarConnectionConfig> {
  const result = await loadAnalyseMeConfig(options);

  if (!result.config) {
    throw new AnalyseMeConfigError(result.errors);
  }

  return result.config;
}

export function normalizeSonarUrl(value: string, options: { allowInsecureHttp?: boolean } = {}): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${SONAR_ENV_VARS.url} is empty.`);
  }

  const normalized = trimTrailingSlashes(trimmed);
  const parsed = new URL(normalized);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${SONAR_ENV_VARS.url} must use http or https.`);
  }

  if (parsed.protocol === "http:" && options.allowInsecureHttp !== true) {
    throw new Error(
      `${SONAR_ENV_VARS.url} uses non-TLS HTTP. Use https or set ${SONAR_ALLOW_INSECURE_HTTP_ENV_VAR}=true only for local or trusted development endpoints.`,
    );
  }

  if (parsed.hostname.length === 0) {
    throw new Error(`${SONAR_ENV_VARS.url} must include a host.`);
  }

  return normalized;
}

export function isInsecureSonarHttpUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    return new URL(value).protocol === "http:";
  } catch {
    return false;
  }
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const parsedLine = parseEnvLine(line);
    if (!parsedLine) continue;
    values[parsedLine.key] = parsedLine.value;
  }

  return values;
}

async function loadOptionalEnvFile(path: string, enabled: boolean, tolerateFileReadErrors: boolean): Promise<ParsedEnvFile> {
  if (!enabled) {
    return {
      values: EMPTY_ENV_FILE_VALUES,
      result: { path, exists: false, loadedKeys: [] },
    };
  }

  try {
    const content = await readFile(path, "utf8");
    const values = parseEnvFileContent(content);
    return {
      values,
      result: { path, exists: true, loadedKeys: Object.keys(values).sort() },
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        values: EMPTY_ENV_FILE_VALUES,
        result: { path, exists: false, loadedKeys: [] },
      };
    }

    if (tolerateFileReadErrors) {
      return {
        values: EMPTY_ENV_FILE_VALUES,
        result: {
          path,
          exists: true,
          loadedKeys: [],
          warning: localFileReadWarning("local .env file", path, error),
        },
      };
    }

    throw error;
  }
}

function collectConfigValues(env: NodeJS.ProcessEnv, envFileValues: Record<string, string>): LoadedConfigValues {
  const values = {} as LoadedConfigValues;

  for (const name of SONAR_ENV_VAR_NAMES) {
    values[name] = collectConfigValue(name, env, envFileValues);
  }

  return values;
}

function collectConfigValue(
  name: SonarEnvVarName,
  env: NodeJS.ProcessEnv,
  envFileValues: Record<string, string>,
): LoadedConfigValue {
  const environmentValue = normalizeOptionalText(env[name]);
  const envFileValue = normalizeOptionalText(envFileValues[name]);

  if (environmentValue) return { value: environmentValue, source: "environment" };
  if (envFileValue) return { value: envFileValue, source: "env-file" };

  return { value: undefined, source: "missing" };
}

function resolveAllowInsecureHttp(env: NodeJS.ProcessEnv, envFileValues: Record<string, string>): boolean {
  const environmentValue = normalizeOptionalText(env[SONAR_ALLOW_INSECURE_HTTP_ENV_VAR]);
  const envFileValue = normalizeOptionalText(envFileValues[SONAR_ALLOW_INSECURE_HTTP_ENV_VAR]);
  const selectedValue = environmentValue ?? envFileValue;

  return isTruthyConfigFlag(selectedValue);
}

function isTruthyConfigFlag(value: string | undefined): boolean {
  if (!value) return false;

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function validateRequiredUrl(field: LoadedConfigValue, allowInsecureHttp: boolean): RequiredFieldResult {
  const required = validateRequiredText(SONAR_ENV_VARS.url, field);

  if (!required.value) return required;

  try {
    const value = normalizeSonarUrl(required.value, { allowInsecureHttp });
    const warnings = isInsecureSonarHttpUrl(value) ? [INSECURE_HTTP_WARNING] : [];

    return { value, errors: [], warnings };
  } catch (error) {
    return { errors: [`Invalid ${SONAR_ENV_VARS.url}: ${errorMessage(error)}`], warnings: [] };
  }
}

function validateRequiredText(name: SonarEnvVarName, field: LoadedConfigValue): RequiredFieldResult {
  if (!field.value) {
    return {
      errors: [`Missing required ${name}. Set ${name} in the environment or local ${DEFAULT_ENV_FILE_NAME}.`],
      warnings: [],
    };
  }

  return { value: field.value, errors: [], warnings: [] };
}

function validateConfiguredScope(values: LoadedConfigValues): string[] {
  const branch = values[SONAR_ENV_VARS.branch].value;
  const pullRequest = values[SONAR_ENV_VARS.pullRequest].value;

  if (branch && pullRequest) {
    return [
      `${SONAR_ENV_VARS.branch} and ${SONAR_ENV_VARS.pullRequest} are mutually exclusive. Set only one analysis scope.`,
    ];
  }

  return [];
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) return undefined;

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex === -1) return undefined;

  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  const rawValue = withoutExport.slice(equalsIndex + 1).trim();
  return { key, value: decodeEnvValue(rawValue) };
}

function decodeEnvValue(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return decodeDoubleQuotedValue(value.slice(1, -1));
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return stripInlineComment(value).trim();
}

function decodeDoubleQuotedValue(value: string): string {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");
}

function stripInlineComment(value: string): string {
  const commentIndex = value.indexOf(" #");
  if (commentIndex === -1) return value;

  return value.slice(0, commentIndex);
}

function trimTrailingSlashes(value: string): string {
  let normalized = value;

  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function configSourceLabel(source: ConfigValueSource): string {
  if (source === "environment") return "environment";
  if (source === "env-file") return DEFAULT_ENV_FILE_NAME;

  return "missing";
}
