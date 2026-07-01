import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_ENV_FILE_NAME, SONAR_ENV_VAR_NAMES, SONAR_ENV_VARS } from "../constants.ts";
import { maskSecretPresence } from "../utils/mask.ts";
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
}

const EMPTY_ENV_FILE_VALUES: Record<string, string> = {};

export async function loadAnalyseMeConfig(
  options: AnalyseMeConfigLoadOptions = {},
): Promise<AnalyseMeConfigLoadResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? join(cwd, DEFAULT_ENV_FILE_NAME);
  const parsedEnvFile = await loadOptionalEnvFile(envFilePath, options.readEnvFile ?? true);
  const sources = collectConfigValues(env, parsedEnvFile.values);
  const warnings: string[] = [];
  const errors: string[] = [];
  const urlField = validateRequiredUrl(sources[SONAR_ENV_VARS.url]);
  const tokenField = validateRequiredText(SONAR_ENV_VARS.token, sources[SONAR_ENV_VARS.token]);

  errors.push(...urlField.errors, ...tokenField.errors);
  errors.push(...validateConfiguredScope(sources));

  if (errors.length > 0 || !urlField.value || !tokenField.value) {
    return { errors, warnings, envFile: parsedEnvFile.result };
  }

  return {
    config: {
      url: urlField.value,
      token: tokenField.value,
      organization: sources[SONAR_ENV_VARS.organization].value,
      projectKey: sources[SONAR_ENV_VARS.projectKey].value,
      branch: sources[SONAR_ENV_VARS.branch].value,
      pullRequest: sources[SONAR_ENV_VARS.pullRequest].value,
      sources,
      tokenDisplay: maskSecretPresence(tokenField.value),
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

export function normalizeSonarUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${SONAR_ENV_VARS.url} is empty.`);
  }

  const normalized = trimTrailingSlashes(trimmed);
  const parsed = new URL(normalized);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${SONAR_ENV_VARS.url} must use http or https.`);
  }

  if (parsed.hostname.length === 0) {
    throw new Error(`${SONAR_ENV_VARS.url} must include a host.`);
  }

  return normalized;
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

async function loadOptionalEnvFile(path: string, enabled: boolean): Promise<ParsedEnvFile> {
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

function validateRequiredUrl(field: LoadedConfigValue): RequiredFieldResult {
  const required = validateRequiredText(SONAR_ENV_VARS.url, field);

  if (!required.value) return required;

  try {
    return { value: normalizeSonarUrl(required.value), errors: [] };
  } catch (error) {
    return { errors: [`Invalid ${SONAR_ENV_VARS.url}: ${errorMessage(error)}`] };
  }
}

function validateRequiredText(name: SonarEnvVarName, field: LoadedConfigValue): RequiredFieldResult {
  if (!field.value) {
    return {
      errors: [`Missing required ${name}. Set ${name} in the environment or local ${DEFAULT_ENV_FILE_NAME}.`],
    };
  }

  return { value: field.value, errors: [] };
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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
