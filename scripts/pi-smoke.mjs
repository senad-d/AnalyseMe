#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const placeholderToken = "analyseme-smoke-placeholder-token";
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const piCommand = process.platform === "win32" ? "pi.cmd" : "pi";
const toolNames = [
  "analyseme_get_project_summary",
  "analyseme_list_issues",
  "analyseme_get_issue",
  "analyseme_list_security_hotspots",
  "analyseme_get_security_hotspot",
];
const smokeChecks = [
  {
    label: "/analyseme help",
    prompt: "/analyseme help",
    expected: ["# AnalyseMe help", "Use `/analyseme help` any time", ...toolNames],
  },
  {
    label: "/analyseme status",
    prompt: "/analyseme",
    expected: ["AnalyseMe", "read-only status", "Project", "present"],
  },
];

const tempCwd = mkdtempSync(join(tmpdir(), "analyseme-pi-smoke-"));

try {
  for (const check of smokeChecks) runSmokeCheck(check);
  console.log("Isolated Pi smoke passed for /analyseme help and /analyseme status.");
  console.log("Tool names verified through /analyseme help output; public-surface contract tests guard registration.");
} finally {
  rmSync(tempCwd, { recursive: true, force: true });
}

function runSmokeCheck(check) {
  const result = spawnSync(piCommand, ["--no-extensions", "-e", repoRoot, "--no-session", "-p", check.prompt], {
    cwd: tempCwd,
    env: smokeEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (result.error) fail(`${check.label} could not start Pi: ${result.error.message}`, output);
  if (result.status !== 0) fail(`${check.label} exited with status ${result.status}`, output);
  if (output.includes(placeholderToken)) fail(`${check.label} printed the placeholder token`, output);

  for (const expected of check.expected) assertIncludes(check.label, output, expected);

  console.log(`Pi smoke ok: ${check.label}`);
}

function smokeEnvironment() {
  return {
    ...process.env,
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    SONARQUBE_URL: "https://sonar.example.com",
    SONARQUBE_TOKEN: placeholderToken,
    SONARQUBE_ORGANIZATION: "smoke-org",
    SONARQUBE_PROJECT_KEY: "smoke-project",
    SONARQUBE_BRANCH: "",
    SONARQUBE_PULL_REQUEST: "",
    SONARQUBE_ALLOW_INSECURE_HTTP: "",
  };
}

function assertIncludes(label, output, expected) {
  if (output.includes(expected)) return;

  fail(`${label} output did not include ${JSON.stringify(expected)}`, output);
}

function fail(message, output) {
  console.error(message);
  console.error("--- Pi output ---");
  console.error(output.trimEnd());
  process.exit(1);
}
