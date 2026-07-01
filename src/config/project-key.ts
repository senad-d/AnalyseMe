import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SONAR_ENV_VARS, SONAR_PROJECT_PROPERTIES_FILE } from "../constants.ts";
import { readGitDiagnostics } from "./git-diagnostics.ts";
import type { ProjectKeyResolution, ProjectKeyResolutionOptions } from "./types.ts";

export async function resolveProjectKey(
  options: ProjectKeyResolutionOptions = {},
): Promise<ProjectKeyResolution> {
  const cwd = options.cwd ?? process.cwd();
  const explicitProjectKey = normalizeProjectKey(options.explicitProjectKey);
  const configuredProjectKey = normalizeProjectKey(options.configuredProjectKey);
  const gitDiagnostics = await readGitDiagnostics(cwd);

  if (explicitProjectKey) {
    return { projectKey: explicitProjectKey, source: "argument", gitDiagnostics };
  }

  if (configuredProjectKey) {
    return { projectKey: configuredProjectKey, source: SONAR_ENV_VARS.projectKey, gitDiagnostics };
  }

  const propertiesProjectKey = await readSonarProjectPropertiesKey(cwd);
  if (propertiesProjectKey) {
    return { projectKey: propertiesProjectKey, source: SONAR_PROJECT_PROPERTIES_FILE, gitDiagnostics };
  }

  return { source: "missing", gitDiagnostics };
}

export async function readSonarProjectPropertiesKey(cwd: string = process.cwd()): Promise<string | undefined> {
  const path = join(cwd, SONAR_PROJECT_PROPERTIES_FILE);

  try {
    const content = await readFile(path, "utf8");
    return parseSonarProjectKey(content);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
