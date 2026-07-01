import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import { executeListIssuesTool, registerListIssuesTool } from "../src/tools/list-issues.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
];

class IssueRouteFetch {
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
  return mkdtemp(join(tmpdir(), "analyseme-list-issues-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

function createSearchResponse(issues, page = 2, pageSize = 5, total = 42) {
  return {
    paging: { pageIndex: page, pageSize, total },
    issues,
  };
}

function activeIssue(key, overrides = {}) {
  return {
    key,
    message: `Message for ${key}`,
    severity: "MAJOR",
    type: "CODE_SMELL",
    issueStatus: "OPEN",
    rule: "typescript:S123",
    component: "demo:src/index.ts",
    line: 12,
    textRange: { startLine: 12, endLine: 12, startOffset: 4, endOffset: 12 },
    tags: ["readability"],
    impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "MEDIUM" }],
    ...overrides,
  };
}

test("registers analyseme_list_issues with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerListIssuesTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.listIssues);
  assert.ok(tools[0].parameters.properties.projectKey);
  assert.ok(tools[0].parameters.properties.limit);
  assert.ok(tools[0].promptSnippet);
  assert.ok(tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.listIssues)));
});

test("executes analyseme_list_issues, filters non-active issues, and returns pagination metadata", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const response = createSearchResponse([
    activeIssue("ACTIVE-1"),
    activeIssue("FALSE-POSITIVE", { resolution: "FALSE-POSITIVE" }),
    activeIssue("ACCEPTED", { issueStatus: "ACCEPTED" }),
    activeIssue("IGNORED", { ignored: true }),
    activeIssue("ACTIVE-2", { line: 19, severity: "CRITICAL" }),
  ]);
  const routeFetch = new IssueRouteFetch(response);

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "issues-secret-token",
      SONARQUBE_ORGANIZATION: "env-org",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeListIssuesTool(
      "call-issues",
      { projectKey: "demo", organization: "arg-org", pullRequest: "17", page: 2, limit: 5 },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);

    assert.match(content, /AnalyseMe active issues: demo/);
    assert.match(content, /ACTIVE-1/);
    assert.match(content, /ACTIVE-2/);
    assert.doesNotMatch(content, /FALSE-POSITIVE`/);
    assert.doesNotMatch(content, /ACCEPTED`/);
    assert.doesNotMatch(content, /IGNORED`/);
    assert.match(content, /Severity\/impact: MAJOR; impacts: MAINTAINABILITY:MEDIUM/);
    assert.match(content, /Location: demo:src\/index.ts \(src\/index.ts\):12/);
    assert.equal(result.details.projectKey, "demo");
    assert.equal(result.details.projectKeySource, "argument");
    assert.equal(result.details.organization, "arg-org");
    assert.equal(result.details.scope, "pull request 17");
    assert.equal(result.details.issues.length, 2);
    assert.equal(result.details.pagination.page, 2);
    assert.equal(result.details.pagination.pageSize, 5);
    assert.equal(result.details.pagination.total, 42);
    assert.equal(result.details.pagination.activeReturned, 2);
    assert.equal(result.details.pagination.excludedNonActive, 3);
    assert.equal(result.details.truncated, false);
    assert.equal(routeFetch.calls.length, 1);
    assert.match(routeFetch.calls[0].url, /componentKeys=demo/);
    assert.match(routeFetch.calls[0].url, /pullRequest=17/);
    assert.match(routeFetch.calls[0].url, /organization=arg-org/);
    assert.doesNotMatch(serializedDetails, /issues-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_list_issues includes visible truncation metadata for long issue output", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const longIssues = Array.from({ length: 100 }, (_, index) =>
    activeIssue(`LONG-${index}`, { message: `Long issue ${index} ${"x".repeat(1000)}` }),
  );
  const routeFetch = new IssueRouteFetch(createSearchResponse(longIssues, 1, 100, 100));

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "issues-secret-token",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeListIssuesTool(
      "call-issues-long",
      { projectKey: "demo", limit: 100 },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(result.details.truncated, true);
    assert.equal(result.details.truncation.truncated, true);
    assert.match(result.content[0].text, /AnalyseMe output truncated/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});
