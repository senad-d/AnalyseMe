import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SONAR_ENV_VARS, SONAR_PROJECT_PROPERTIES_FILE } from "../constants.ts";
import { isMissingFileError, localFileReadWarning } from "./file-errors.ts";
import { readGitDiagnostics } from "./git-diagnostics.ts";
import type { GitDiagnostics, ProjectKeyResolution, ProjectKeyResolutionOptions } from "./types.ts";

interface ProjectPropertiesKeyReadResult {
  projectKey?: string;
  warnings: string[];
}

export async function resolveProjectKey(
  options: ProjectKeyResolutionOptions = {},
): Promise<ProjectKeyResolution> {
  const cwd = options.cwd ?? process.cwd();
  const explicitProjectKey = normalizeProjectKey(options.explicitProjectKey);
  const configuredProjectKey = normalizeProjectKey(options.configuredProjectKey);
  const tolerateFileReadErrors = options.tolerateFileReadErrors ?? false;
  const gitDiagnostics = await readGitDiagnostics(cwd, { tolerateFileReadErrors: true });
  const warnings = [...gitDiagnostics.warnings];

  if (explicitProjectKey) {
    return resolution(explicitProjectKey, "argument", gitDiagnostics, warnings);
  }

  if (configuredProjectKey) {
    return resolution(configuredProjectKey, SONAR_ENV_VARS.projectKey, gitDiagnostics, warnings);
  }

  const propertiesResult = await readSonarProjectPropertiesKeyForResolution(cwd, tolerateFileReadErrors);
  warnings.push(...propertiesResult.warnings);

  if (propertiesResult.projectKey) {
    return resolution(propertiesResult.projectKey, SONAR_PROJECT_PROPERTIES_FILE, gitDiagnostics, warnings);
  }

  return { source: "missing", gitDiagnostics, warnings };
}

export async function readSonarProjectPropertiesKey(cwd: string = process.cwd()): Promise<string | undefined> {
  const result = await readSonarProjectPropertiesKeyForResolution(cwd, false);
  return result.projectKey;
}

export function parseSonarProjectKey(content: string): string | undefined {
  const properties = parsePropertiesFile(content);
  return normalizeProjectKey(properties["sonar.projectKey"]);
}

export function parsePropertiesFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const property = parsePropertyLine(line);
    if (!property) continue;
    values[property.key] = property.value;
  }

  return values;
}

async function readSonarProjectPropertiesKeyForResolution(
  cwd: string,
  tolerateFileReadErrors: boolean,
): Promise<ProjectPropertiesKeyReadResult> {
  const path = join(cwd, SONAR_PROJECT_PROPERTIES_FILE);

  try {
    const content = await readFile(path, "utf8");
    return { projectKey: parseSonarProjectKey(content), warnings: [] };
  } catch (error) {
    if (isMissingFileError(error)) return { warnings: [] };
    if (tolerateFileReadErrors) {
      return { warnings: [localFileReadWarning(SONAR_PROJECT_PROPERTIES_FILE, path, error)] };
    }

    throw error;
  }
}

function resolution(
  projectKey: string,
  source: ProjectKeyResolution["source"],
  gitDiagnostics: GitDiagnostics,
  warnings: string[],
): ProjectKeyResolution {
  return { projectKey, source, gitDiagnostics, warnings };
}

function parsePropertyLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("!")) return undefined;

  const separatorIndex = findPropertySeparator(trimmed);
  if (separatorIndex === -1) return { key: trimmed, value: "" };

  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed.slice(separatorIndex + 1).trim();

  if (key.length === 0) return undefined;
  return { key, value };
}

function findPropertySeparator(line: string): number {
  const equalsIndex = line.indexOf("=");
  const colonIndex = line.indexOf(":");

  if (equalsIndex === -1) return colonIndex;
  if (colonIndex === -1) return equalsIndex;

  return Math.min(equalsIndex, colonIndex);
}

function normalizeProjectKey(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
