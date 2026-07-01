import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import { executeProjectSummaryTool, registerProjectSummaryTool } from "../src/tools/project-summary.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
];

class RouteFetch {
  calls = [];

  async fetch(url, init) {
    this.calls.push({ url, init });

    if (url.includes("/api/qualitygates/project_status")) {
      return new Response(JSON.stringify({ projectStatus: { status: "OK" } }), { status: 200 });
    }

    if (url.includes("/api/measures/component")) {
      return new Response(
        JSON.stringify({
          component: {
            analysisDate: "2026-01-01T00:00:00+0000",
            measures: [
              { metric: "bugs", value: "0" },
              { metric: "coverage", value: "91.2" },
            ],
          },
        }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ errors: [{ msg: "unexpected path" }] }), { status: 404 });
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
  return mkdtemp(join(tmpdir(), "analyseme-tool-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

test("registers analyseme_get_project_summary with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerProjectSummaryTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.getProjectSummary);
  assert.match(tools[0].description, /read/i);
  assert.ok(tools[0].parameters.properties.projectKey);
  assert.ok(tools[0].promptSnippet);
  assert.ok(tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.getProjectSummary)));
});

test("executes analyseme_get_project_summary with mocked Sonar responses", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new RouteFetch();

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "tool-secret-token",
      SONARQUBE_ORGANIZATION: "env-org",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeProjectSummaryTool(
      "call-1",
      { projectKey: " demo ", organization: " arg-org ", branch: " main " },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);

    assert.match(content, /AnalyseMe project summary: demo/);
    assert.match(content, /Quality gate: OK/);
    assert.match(content, /coverage: 91.2/);
    assert.equal(result.details.projectKey, "demo");
    assert.equal(result.details.projectKeySource, "argument");
    assert.equal(result.details.organization, "arg-org");
    assert.equal(result.details.scope, "branch main");
    assert.equal(result.details.summary.qualityGateStatus, "OK");
    assert.equal(result.details.truncation.truncated, false);
    assert.equal(routeFetch.calls.length, 2);
    assert.match(routeFetch.calls[0].url, /organization=arg-org/);
    assert.match(routeFetch.calls[0].url, /branch=main/);
    assert.doesNotMatch(serializedDetails, /tool-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});
