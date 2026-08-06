import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { SONAR_SCANNER_PATH_ENV_VAR } from "../constants.ts";
import { isMissingFileError } from "../config/file-errors.ts";

export const DEFAULT_SCANNER_COMMAND = "sonar-scanner";
export const DEFAULT_SCAN_TIMEOUT_MS = 600_000;
export const MAX_SCAN_TIMEOUT_MS = 3_600_000;
export const SCANNER_KILL_GRACE_MS = 5_000;
export const DEFAULT_SCAN_LOG_MAX_BYTES = 64 * 1024;
export const SCANNER_WORK_DIR = ".scannerwork";
export const SCANNER_REPORT_TASK_FILE = "report-task.txt";

/**
 * Scanner properties AnalyseMe manages itself. Connection and credential
 * properties are rejected from tool input so the token is only ever passed to
 * the scanner process through its environment, and so a scan cannot be
 * redirected to another server than the configured Sonar URL.
 */
export const RESERVED_SCANNER_PROPERTY_KEYS = new Set([
  "sonar.host.url",
  "sonar.token",
  "sonar.login",
  "sonar.password",
]);

const SCANNER_PROPERTY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*=/;

export const SCANNER_INSTALL_DOCS_URL =
  "https://docs.sonarsource.com/sonarqube-server/latest/analyzing-source-code/scanners/sonarscanner/";

export class ScannerNotFoundError extends Error {
  readonly command: string;

  constructor(command: string) {
    super(`Scanner command "${command}" was not found.`);
    this.name = "ScannerNotFoundError";
    this.command = command;
  }
}

export interface ScannerResolution {
  command: string;
  source: "environment" | "default";
}

export interface BuildScannerArgsOptions {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  waitForQualityGate?: boolean;
  properties?: string[];
}

export interface RunScannerProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
  maxLogBytes?: number;
}

export interface ScannerRunResult {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  durationMs: number;
  /** Combined stdout/stderr tail. Callers must sanitize and redact before rendering. */
  log: string;
  logBytesTotal: number;
  logTruncated: boolean;
}

export interface ScannerReportTask {
  projectKey?: string;
  serverUrl?: string;
  dashboardUrl?: string;
  ceTaskId?: string;
  ceTaskUrl?: string;
}

export interface ScannerReportTaskReadResult {
  reportTask?: ScannerReportTask;
  path: string;
  warnings: string[];
}

export interface ScannerInstallOption {
  manager: string;
  installCommand: string;
}

interface PackageManagerCandidate {
  executable: string;
  manager: string;
  installCommand: string;
  platforms?: NodeJS.Platform[];
}

const PACKAGE_MANAGER_CANDIDATES: PackageManagerCandidate[] = [
  { executable: "brew", manager: "Homebrew", installCommand: "brew install sonar-scanner", platforms: ["darwin", "linux"] },
  { executable: "scoop", manager: "Scoop", installCommand: "scoop install sonar-scanner", platforms: ["win32"] },
  { executable: "choco", manager: "Chocolatey", installCommand: "choco install sonarscanner", platforms: ["win32"] },
];

export function resolveScannerCommand(env: NodeJS.ProcessEnv = process.env): ScannerResolution {
  const configured = env[SONAR_SCANNER_PATH_ENV_VAR]?.trim();

  if (configured) return { command: configured, source: "environment" };

  return { command: DEFAULT_SCANNER_COMMAND, source: "default" };
}

export async function detectScannerInstallOptions(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<ScannerInstallOption[]> {
  const options: ScannerInstallOption[] = [];

  for (const candidate of PACKAGE_MANAGER_CANDIDATES) {
    if (candidate.platforms && !candidate.platforms.includes(platform)) continue;
    if (!(await isExecutableOnPath(candidate.executable, env, platform))) continue;

    options.push({ manager: candidate.manager, installCommand: candidate.installCommand });
  }

  return options;
}

export function buildScannerNotFoundMessage(
  command: string,
  installOptions: ScannerInstallOption[],
  platform: NodeJS.Platform = process.platform,
): string {
  const lines = [
    `Scanner command "${command}" was not found. AnalyseMe needs the SonarScanner CLI to run a local scan.`,
  ];

  if (installOptions.length > 0) {
    lines.push("Install options detected on this system:");

    for (const option of installOptions) {
      lines.push(`- ${option.manager}: ${option.installCommand}`);
    }
  } else {
    lines.push(manualInstallHint(platform));
  }

  lines.push(
    `Alternatively download the SonarScanner CLI from ${SCANNER_INSTALL_DOCS_URL} and add it to PATH, or set ${SONAR_SCANNER_PATH_ENV_VAR} to the scanner binary.`,
    "Offer to run one of the install commands for the user (ask before installing), then retry the scan; or let the user install it themselves.",
  );

  return lines.join("\n");
}

function manualInstallHint(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return "No supported package manager was detected. On macOS, install Homebrew and run `brew install sonar-scanner`, or download the CLI zip.";
  }

  if (platform === "win32") {
    return "No supported package manager was detected. On Windows, install Scoop (`scoop install sonar-scanner`) or Chocolatey (`choco install sonarscanner`), or download the CLI zip.";
  }

  return "No supported package manager was detected. Download the SonarScanner CLI zip, unpack it, and add its bin/sonar-scanner to PATH.";
}

async function isExecutableOnPath(name: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<boolean> {
  const pathValue = env.PATH ?? env.Path ?? "";
  const extensions = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const accessMode = platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK;

  for (const directory of pathValue.split(delimiter)) {
    if (directory.length === 0) continue;

    for (const extension of extensions) {
      try {
        await access(join(directory, `${name}${extension}`), accessMode);
        return true;
      } catch {
        // Not present in this directory; keep searching.
      }
    }
  }

  return false;
}

export function validateScannerProperties(properties: readonly string[]): string[] {
  const normalized: string[] = [];

  for (const property of properties) {
    const trimmed = property.trim();

    if (!SCANNER_PROPERTY_PATTERN.test(trimmed)) {
      throw new Error(
        `Invalid scanner property "${trimmed}". Pass properties as key=value pairs, for example sonar.exclusions=**/dist/**.`,
      );
    }

    const key = trimmed.slice(0, trimmed.indexOf("=")).toLowerCase();

    if (RESERVED_SCANNER_PROPERTY_KEYS.has(key)) {
      throw new Error(
        `Scanner property "${key}" is managed by AnalyseMe and cannot be overridden. The configured Sonar URL and token are always used.`,
      );
    }

    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Extra tool-input properties come first and AnalyseMe-managed values last, so
 * the resolved project key, organization, and scope always win.
 */
export function buildScannerArgs(options: BuildScannerArgsOptions): string[] {
  const args = (options.properties ?? []).map((property) => `-D${property}`);

  if (options.projectKey) args.push(`-Dsonar.projectKey=${options.projectKey}`);
  if (options.organization) args.push(`-Dsonar.organization=${options.organization}`);
  if (options.branch) args.push(`-Dsonar.branch.name=${options.branch}`);
  if (options.pullRequest) args.push(`-Dsonar.pullrequest.key=${options.pullRequest}`);
  if (options.waitForQualityGate) args.push("-Dsonar.qualitygate.wait=true");

  return args;
}

export async function runScannerProcess(options: RunScannerProcessOptions): Promise<ScannerRunResult> {
  const maxLogBytes = options.maxLogBytes ?? DEFAULT_SCAN_LOG_MAX_BYTES;
  const startedAt = Date.now();
  // The scanner is detached into its own process group (POSIX) so that a
  // timeout or abort can stop the whole scanner tree, including JVM children.
  const detached = process.platform !== "win32";
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logChunks: Buffer[] = [];
  let bufferedBytes = 0;
  let totalBytes = 0;
  let timedOut = false;
  let aborted = false;
  let killTimer: NodeJS.Timeout | undefined;

  const appendChunk = (chunk: Buffer): void => {
    logChunks.push(chunk);
    bufferedBytes += chunk.byteLength;
    totalBytes += chunk.byteLength;

    while (bufferedBytes > maxLogBytes && logChunks.length > 1) {
      const dropped = logChunks.shift();
      bufferedBytes -= dropped?.byteLength ?? 0;
    }
  };

  const killScannerTree = (signal: NodeJS.Signals): void => {
    if (detached && typeof child.pid === "number") {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // Fall back to killing the direct child if the group is already gone.
      }
    }

    child.kill(signal);
  };

  const stopChild = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return;

    killScannerTree("SIGTERM");
    killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) killScannerTree("SIGKILL");
    }, SCANNER_KILL_GRACE_MS);
  };

  const handleAbort = (): void => {
    aborted = true;
    stopChild();
  };

  child.stdout.on("data", appendChunk);
  child.stderr.on("data", appendChunk);

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    stopChild();
  }, options.timeoutMs);

  if (options.signal?.aborted) {
    handleAbort();
  } else {
    options.signal?.addEventListener("abort", handleAbort, { once: true });
  }

  try {
    const { exitCode, signalCode } = await waitForScannerClose(child, options.command);

    return {
      exitCode,
      signalCode,
      timedOut,
      aborted,
      durationMs: Date.now() - startedAt,
      log: Buffer.concat(logChunks).toString("utf8"),
      logBytesTotal: totalBytes,
      logTruncated: totalBytes > bufferedBytes,
    };
  } finally {
    clearTimeout(timeoutTimer);
    if (killTimer) clearTimeout(killTimer);
    options.signal?.removeEventListener("abort", handleAbort);
  }
}

export function parseReportTask(content: string): ScannerReportTask {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    values[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
  }

  return {
    projectKey: nonEmpty(values.projectKey),
    serverUrl: nonEmpty(values.serverUrl),
    dashboardUrl: nonEmpty(values.dashboardUrl),
    ceTaskId: nonEmpty(values.ceTaskId),
    ceTaskUrl: nonEmpty(values.ceTaskUrl),
  };
}

export async function readScannerReportTask(cwd: string): Promise<ScannerReportTaskReadResult> {
  const path = join(cwd, SCANNER_WORK_DIR, SCANNER_REPORT_TASK_FILE);

  try {
    const content = await readFile(path, "utf8");
    return { reportTask: parseReportTask(content), path, warnings: [] };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        path,
        warnings: [
          `Scanner report file ${SCANNER_WORK_DIR}/${SCANNER_REPORT_TASK_FILE} was not found, so the analysis upload could not be confirmed.`,
        ],
      };
    }

    return {
      path,
      warnings: [`Scanner report file could not be read: ${errorMessage(error)}`],
    };
  }
}

const SCANNER_STREAM_FLUSH_GRACE_MS = 1_000;

/**
 * Resolves on "close" (all output flushed) but falls back to "exit" plus a
 * short flush grace, because killed scanners can leave grandchildren holding
 * the stdio pipes open and "close" would then wait on them indefinitely.
 */
function waitForScannerClose(
  child: ReturnType<typeof spawn>,
  command: string,
): Promise<{ exitCode: number | null; signalCode: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let flushTimer: NodeJS.Timeout | undefined;

    const settle = (result: { exitCode: number | null; signalCode: NodeJS.Signals | null }): void => {
      if (settled) return;
      settled = true;
      if (flushTimer) clearTimeout(flushTimer);
      resolve(result);
    };

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (flushTimer) clearTimeout(flushTimer);

      if (error.code === "ENOENT") {
        reject(new ScannerNotFoundError(command));
        return;
      }

      reject(new Error(`Scanner command "${command}" failed to start: ${error.message}`));
    });

    child.once("exit", (exitCode, signalCode) => {
      flushTimer = setTimeout(() => settle({ exitCode, signalCode }), SCANNER_STREAM_FLUSH_GRACE_MS);
    });

    child.once("close", (exitCode, signalCode) => {
      settle({ exitCode, signalCode });
    });
  });
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
