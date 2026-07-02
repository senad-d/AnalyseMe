import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import { createSonarAuthorizationHeader } from "../src/sonar/client.ts";
import { executeGetIssueTool } from "../src/tools/get-issue.ts";
import { executeGetSecurityHotspotTool } from "../src/tools/get-security-hotspot.ts";
import { executeListIssuesTool } from "../src/tools/list-issues.ts";
import { executeListSecurityHotspotsTool } from "../src/tools/list-security-hotspots.ts";
import { executeProjectSummaryTool } from "../src/tools/project-summary.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
];

const secretToken = "error-contract-token";
const basicCredential = `${secretToken}:`;
const authorizationHeader = createSonarAuthorizationHeader(secretToken);
const basicPayload = authorizationHeader.replace(/^Basic /, "");
const secretVariants = [
  secretToken,
  basicCredential,
  authorizationHeader,
  basicPayload,
  encodeURIComponent(secretToken),
  encodeURIComponent(basicCredential),
  encodeURIComponent(authorizationHeader),
  encodeURIComponent(basicPayload),
];
const publicTools = [
  {
    name: ANALYSEME_TOOL_NAMES.getProjectSummary,
    execute: executeProjectSummaryTool,
    params: { projectKey: "demo" },
    failurePathPattern: /qualitygates\/project_status/,
  },
  {
    name: ANALYSEME_TOOL_NAMES.listIssues,
    execute: executeListIssuesTool,
    params: { projectKey: "demo", limit: 1 },
    failurePathPattern: /issues\/search/,
  },
  {
    name: ANALYSEME_TOOL_NAMES.getIssue,
    execute: executeGetIssueTool,
    params: { issueKey: "ISSUE-1", projectKey: "demo" },
    failurePathPattern: /issues\/search/,
  },
  {
    name: ANALYSEME_TOOL_NAMES.listSecurityHotspots,
    execute: executeListSecurityHotspotsTool,
    params: { projectKey: "demo", limit: 1 },
    failurePathPattern: /hotspots\/search/,
  },
  {
    name: ANALYSEME_TOOL_NAMES.getSecurityHotspot,
    execute: executeGetSecurityHotspotTool,
    params: { hotspotKey: "HOTSPOT-1", projectKey: "demo" },
    failurePathPattern: /hotspots\/show/,
  },
];

class ContractFailureFetch {
  calls = [];
  mode;

  constructor(mode) {
    this.mode = mode;
  }

  async fetch(url, init) {
    this.calls.push({ url, init });

    if (this.mode === "auth") return sonarErrorResponse(403, "Forbidden", "Authentication failed");
    if (this.mode === "server") return sonarErrorResponse(503, "Service Unavailable", "Sonar temporarily unavailable");
    if (this.mode === "malformed") return new Response(`not-json ${secretToken} ${authorizationHeader}`, { status: 200 });

    throw new Error(`Network unreachable ${secretToken} ${authorizationHeader}`);
  }
}

function sonarErrorResponse(status, statusText, message) {
  return new Response(
    JSON.stringify({ errors: [{ msg: `${message} ${secretToken} ${authorizationHeader} ${basicPayload}` }] }),
    { status, statusText },
  );
}

function snapshotEnv() {
  const snapshot = {};

  for (const key of envKeys) snapshot[key] = process.env[key];

  return snapshot;
}

function applyEnv(values) {
  for (const key of envKeys) delete process.env[key];

  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

function restoreEnv(snapshot) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    if (snapshot[key] !== undefined) process.env[key] = snapshot[key];
  }
}

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "analyseme-error-contract-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

async function captureToolError(tool, cwd) {
  try {
    await tool.execute(`contract-${tool.name}`, tool.params, undefined, undefined, { cwd });
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }

  assert.fail(`${tool.name} should have thrown`);
}

function assertSecretSafeText(text) {
  for (const variant of secretVariants) {
    assert.equal(text.includes(variant), false, `error text exposed secret variant ${variant}`);
  }
}

function assertActionableError(error, pattern) {
  assert.match(error.message, pattern);
  assertSecretSafeText(error.message);
}

for (const tool of publicTools) {
  test(`${tool.name} throws an actionable error when SONARQUBE_URL is missing`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("network");

    try {
      applyEnv({ SONARQUBE_TOKEN: secretToken });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Missing required SONARQUBE_URL.*Set SONARQUBE_URL/s);
      assert.equal(routeFetch.calls.length, 0);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });

  test(`${tool.name} throws an actionable error when SONARQUBE_TOKEN is missing`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("network");

    try {
      applyEnv({ SONARQUBE_URL: "https://sonar.example.com" });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Missing required SONARQUBE_TOKEN.*Set SONARQUBE_TOKEN/s);
      assert.equal(routeFetch.calls.length, 0);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });

  test(`${tool.name} throws a safe error for Sonar auth failures`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("auth");

    try {
      applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: secretToken });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Sonar API request failed.*HTTP 403 Forbidden.*Authentication failed/s);
      assert.match(error.message, tool.failurePathPattern);
      assert.equal(routeFetch.calls.length, 1);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });

  test(`${tool.name} throws a safe error for Sonar 5xx failures`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("server");

    try {
      applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: secretToken });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Sonar API request failed.*HTTP 503 Service Unavailable.*Sonar temporarily unavailable/s);
      assert.match(error.message, tool.failurePathPattern);
      assert.equal(routeFetch.calls.length, 1);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });

  test(`${tool.name} throws a safe error for malformed JSON`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("malformed");

    try {
      applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: secretToken });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Sonar API returned invalid JSON/);
      assert.match(error.message, tool.failurePathPattern);
      assert.equal(routeFetch.calls.length, 1);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });

  test(`${tool.name} throws a safe error for network failures`, async () => {
    const cwd = await createTempDir();
    const envSnapshot = snapshotEnv();
    const fetchSnapshot = globalThis.fetch;
    const routeFetch = new ContractFailureFetch("network");

    try {
      applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: secretToken });
      globalThis.fetch = routeFetch.fetch.bind(routeFetch);

      const error = await captureToolError(tool, cwd);

      assertActionableError(error, /Sonar request failed.*Network unreachable/s);
      assert.equal(routeFetch.calls.length, 1);
    } finally {
      restoreEnv(envSnapshot);
      globalThis.fetch = fetchSnapshot;
      await removeTempDir(cwd);
    }
  });
}
