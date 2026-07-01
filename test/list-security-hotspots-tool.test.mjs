import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import {
  executeListSecurityHotspotsTool,
  registerListSecurityHotspotsTool,
} from "../src/tools/list-security-hotspots.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
];

class HotspotRouteFetch {
  calls = [];
  response;

  constructor(response) {
    this.response = response;
  }

  async fetch(url, init) {
    this.calls.push({ url, init });
    return new Response(JSON.stringify(this.response), { status: 200 });
  }
}

function snapshotEnv() {
  const snapshot = {};

  for (const key of envKeys) {
    snapshot[key] = process.env[key];
  }

  return snapshot;
}

function applyEnv(values) {
  for (const key of envKeys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

function restoreEnv(snapshot) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    if (snapshot[key] !== undefined) process.env[key] = snapshot[key];
  }
}

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "analyseme-list-hotspots-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

function createHotspotResponse(hotspots, page = 3, pageSize = 4, total = 18) {
  return {
    paging: { pageIndex: page, pageSize, total },
    hotspots,
  };
}

function reviewHotspot(key, overrides = {}) {
  return {
    key,
    message: `Hotspot message for ${key}`,
    status: "TO_REVIEW",
    vulnerabilityProbability: "HIGH",
    securityCategory: "sql-injection",
    component: "demo:src/db.ts",
    line: 33,
    textRange: { startLine: 33, endLine: 33, startOffset: 2, endOffset: 18 },
    author: "author-login",
    assignee: "assignee-login",
    creationDate: "2026-01-01T00:00:00+0000",
    updateDate: "2026-01-02T00:00:00+0000",
    ...overrides,
  };
}

test("registers analyseme_list_security_hotspots with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerListSecurityHotspotsTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.listSecurityHotspots);
  assert.ok(tools[0].parameters.properties.projectKey);
  assert.ok(tools[0].parameters.properties.limit);
  assert.ok(tools[0].promptSnippet);
  assert.ok(
    tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.listSecurityHotspots)),
  );
});

test("executes analyseme_list_security_hotspots with branch scope and pagination metadata", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const response = createHotspotResponse([
    reviewHotspot("HOTSPOT-1"),
    reviewHotspot("REVIEWED", { status: "REVIEWED" }),
    reviewHotspot("SAFE", { resolution: "SAFE" }),
    reviewHotspot("HOTSPOT-2", { line: 44, vulnerabilityProbability: "LOW" }),
  ]);
  const routeFetch = new HotspotRouteFetch(response);

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "hotspot-secret-token",
      SONARQUBE_ORGANIZATION: "env-org",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeListSecurityHotspotsTool(
      "call-hotspots",
      { projectKey: " demo ", organization: " arg-org ", branch: " feature/a ", page: 3, limit: 4 },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);

    assert.match(content, /security hotspots requiring review: demo/);
    assert.match(content, /HOTSPOT-1/);
    assert.match(content, /HOTSPOT-2/);
    assert.doesNotMatch(content, /REVIEWED`/);
    assert.doesNotMatch(content, /SAFE`/);
    assert.match(content, /Vulnerability probability: HIGH/);
    assert.match(content, /Security category: sql-injection/);
    assert.match(content, /demo:src\/db.ts \(src\/db.ts\):33/);
    assert.match(content, /Created\/updated: 2026-01-01T00:00:00\+0000 \/ 2026-01-02T00:00:00\+0000/);
    assert.equal(result.details.projectKey, "demo");
    assert.equal(result.details.projectKeySource, "argument");
    assert.equal(result.details.organization, "arg-org");
    assert.equal(result.details.scope, "branch feature/a");
    assert.equal(result.details.hotspots.length, 2);
    assert.equal(result.details.pagination.page, 3);
    assert.equal(result.details.pagination.pageSize, 4);
    assert.equal(result.details.pagination.total, 18);
    assert.equal(result.details.pagination.requiringReviewReturned, 2);
    assert.equal(result.details.pagination.excludedNonReview, 2);
    assert.equal(result.details.truncated, false);
    assert.equal(routeFetch.calls.length, 1);
    assert.match(routeFetch.calls[0].url, /projectKey=demo/);
    assert.match(routeFetch.calls[0].url, /branch=feature%2Fa/);
    assert.match(routeFetch.calls[0].url, /organization=arg-org/);
    assert.doesNotMatch(serializedDetails, /hotspot-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_list_security_hotspots reports malformed rows without rendering placeholder keys", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const response = createHotspotResponse(
    [
      { message: "Missing hotspot key", status: "TO_REVIEW" },
      reviewHotspot("HOTSPOT-1"),
      reviewHotspot("REVIEWED", { status: "REVIEWED" }),
    ],
    1,
    3,
    3,
  );
  const routeFetch = new HotspotRouteFetch(response);

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "hotspot-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeListSecurityHotspotsTool(
      "call-hotspots-malformed",
      { projectKey: "demo", limit: 3 },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;

    assert.match(content, /HOTSPOT-1/);
    assert.doesNotMatch(content, /unknown-hotspot/);
    assert.match(content, /Warnings/);
    assert.match(content, /Skipped 1 malformed Sonar hotspot row/);
    assert.equal(result.details.hotspots.length, 1);
    assert.equal(result.details.pagination.requiringReviewReturned, 1);
    assert.equal(result.details.pagination.excludedNonReview, 1);
    assert.equal(result.details.pagination.malformedRowsSkipped, 1);
    assert.equal(result.details.partialData.malformedRowsSkipped, 1);
    assert.equal(result.details.partialData.invalidRows[0].reason, "missing non-empty hotspot key");
    assert.match(result.details.warnings.join("\n"), /malformed Sonar hotspot row/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_list_security_hotspots supports pull request scope and truncates long output", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const longHotspots = Array.from({ length: 100 }, (_, index) =>
    reviewHotspot(`LONG-HOTSPOT-${index}`, { message: `Long hotspot ${index} ${"x".repeat(1000)}` }),
  );
  const routeFetch = new HotspotRouteFetch(createHotspotResponse(longHotspots, 1, 100, 100));

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "hotspot-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeListSecurityHotspotsTool(
      "call-hotspots-long",
      { projectKey: "demo", pullRequest: "22", limit: 100 },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(result.details.scope, "pull request 22");
    assert.equal(result.details.truncated, true);
    assert.equal(result.details.truncation.truncated, true);
    assert.match(result.content[0].text, /AnalyseMe output truncated/);
    assert.match(routeFetch.calls[0].url, /pullRequest=22/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});
