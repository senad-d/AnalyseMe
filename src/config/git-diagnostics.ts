import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { GitDiagnostics, GitRemoteDiagnostic } from "./types.ts";

export async function readGitDiagnostics(cwd: string = process.cwd()): Promise<GitDiagnostics> {
  const configPath = join(cwd, ".git", "config");

  try {
    const content = await readFile(configPath, "utf8");
    return { configPath, exists: true, remotes: parseGitRemotes(content) };
  } catch (error) {
    if (isMissingFileError(error)) return { configPath, exists: false, remotes: [] };
    throw error;
  }
}

export function parseGitRemotes(content: string): GitRemoteDiagnostic[] {
  const remotes: GitRemoteDiagnostic[] = [];
  const lines = content.split(/\r?\n/);
  let currentRemoteName: string | undefined;
  let currentRemoteUrl: string | undefined;

  for (const line of lines) {
    const sectionName = parseRemoteSectionName(line);

    if (sectionName !== undefined) {
      appendRemote(remotes, currentRemoteName, currentRemoteUrl);
      currentRemoteName = sectionName;
      currentRemoteUrl = undefined;
      continue;
    }

    if (!currentRemoteName) continue;

    const parsedSetting = parseGitConfigSetting(line);
    if (parsedSetting.key === "url") currentRemoteUrl = parsedSetting.value;
  }

  appendRemote(remotes, currentRemoteName, currentRemoteUrl);
  return remotes;
}

export function repositoryNameSuggestionFromRemoteUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (trimmed.length === 0) return undefined;

  const slashIndex = trimmed.lastIndexOf("/");
  const colonIndex = trimmed.lastIndexOf(":");
  const splitIndex = Math.max(slashIndex, colonIndex);
  const finalSegment = splitIndex === -1 ? trimmed : trimmed.slice(splitIndex + 1);
  const withoutGit = finalSegment.endsWith(".git") ? finalSegment.slice(0, -".git".length) : finalSegment;
  const sanitized = withoutGit.trim();

  return sanitized.length > 0 ? sanitized : undefined;
}

function appendRemote(remotes: GitRemoteDiagnostic[], name: string | undefined, url: string | undefined): void {
  if (!name || !url) return;

  remotes.push({
    name,
    url,
    repositoryNameSuggestion: repositoryNameSuggestionFromRemoteUrl(url),
  });
}

function parseRemoteSectionName(line: string): string | undefined {
  const match = /^\s*\[remote\s+"([^"]+)"\]\s*$/.exec(line);
  return match?.[1];
}

function parseGitConfigSetting(line: string): { key?: string; value?: string } {
  const equalsIndex = line.indexOf("=");
  if (equalsIndex === -1) return {};

  return {
    key: line.slice(0, equalsIndex).trim(),
    value: line.slice(equalsIndex + 1).trim(),
  };
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
