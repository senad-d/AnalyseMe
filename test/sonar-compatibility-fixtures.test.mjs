import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SONAR_ENDPOINTS } from "../src/sonar/endpoints.ts";
import { mapSecurityHotspotDetail } from "../src/sonar/hotspot-mapping.ts";
import { mapIssueDetail } from "../src/sonar/issue-mapping.ts";
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

const fixturePaths = [
  "sonarqube-10.6-core.json",
  "sonarqube-9.9-fallbacks.json",
  "sonarcloud-current-hotspots.json",
];

class FixtureRouteFetch {
  calls = [];
  fixture;
  options;

  constructor(fixture, options = {}) {
    this.fixture = fixture;
    this.options = options;
  }

  async fetch(url, init) {
    this.calls.push({ url, init });

    if (url.includes(SONAR_ENDPOINTS.projectStatus)) return this.jsonEndpoint("projectStatus");
    if (url.includes(SONAR_ENDPOINTS.componentMeasures)) return this.jsonEndpoint("componentMeasures");
    if (url.includes(SONAR_ENDPOINTS.issueSearch)) return this.jsonEndpoint("issueSearch");
    if (url.includes(SONAR_ENDPOINTS.ruleShow)) return this.jsonEndpoint("ruleShow");
    if (url.includes(SONAR_ENDPOINTS.sourceIssueSnippets)) return this.sourceIssueSnippetsResponse();
    if (url.includes(SONAR_ENDPOINTS.hotspotSearch)) return this.jsonEndpoint("hotspotSearch");
    if (url.includes(SONAR_ENDPOINTS.hotspotShow)) return this.jsonEndpoint("hotspotShow");
    if (url.includes(SONAR_ENDPOINTS.sourceShow)) return this.jsonEndpoint("sourceShow");

    return new Response(JSON.stringify({ errors: [{ msg: `unexpected fixture path ${url}` }] }), { status: 404 });
  }

  jsonEndpoint(name) {
    const payload = this.fixture.endpoints[name];
    if (payload === undefined) {
      return new Response(JSON.stringify({ errors: [{ msg: `fixture endpoint ${name} is unavailable` }] }), { status: 404 });
    }

    return new Response(JSON.stringify(payload), { status: 200 });
  }

  sourceIssueSnippetsResponse() {
    if (this.options.sourceIssueSnippetsUnavailable) {
      return new Response(JSON.stringify({ errors: [{ msg: "source snippets unavailable in this fixture" }] }), {
        status: 404,
      });
    }

    return this.jsonEndpoint("sourceIssueSnippets");
  }
}

async function loadFixture(path) {
  const content = await readFile(new URL(`fixtures/sonar-api/${path}`, import.meta.url), "utf8");
  return JSON.parse(content);
}

async function loadFixtures() {
  return Promise.all(fixturePaths.map(loadFixture));
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
  return mkdtemp(join(tmpdir(), "analyseme-compat-fixtures-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

test("Sonar compatibility fixture matrix covers every read-only endpoint", async () => {
  const fixtures = await loadFixtures();
  const coveredEndpointNames = new Set(fixtures.flatMap((fixture) => Object.keys(fixture.endpoints)));

  assert.deepEqual(
    fixtures.map((fixture) => fixture.name),
    ["sonarqube-10.6-core", "sonarqube-9.9-fallbacks", "sonarcloud-current-hotspots"],
  );

  for (const endpointName of Object.keys(SONAR_ENDPOINTS)) {
    assert.ok(coveredEndpointNames.has(endpointName), `fixture matrix missing ${endpointName}`);
  }
});

test("SonarQube 10.6 core fixture exercises all public AnalyseMe tools", async () => {
  const fixture = await loadFixture("sonarqube-10.6-core.json");
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new FixtureRouteFetch(fixture);

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "fixture-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const summary = await executeProjectSummaryTool(
      "fixture-summary",
      { projectKey: fixture.projectKey },
      undefined,
      undefined,
      { cwd },
    );
    const issues = await executeListIssuesTool(
      "fixture-list-issues",
      { projectKey: fixture.projectKey, limit: 2, page: 1 },
      undefined,
      undefined,
      { cwd },
    );
    const issue = await executeGetIssueTool(
      "fixture-get-issue",
      { issueKey: fixture.issueKey, projectKey: fixture.projectKey },
      undefined,
      undefined,
      { cwd },
    );
    const hotspots = await executeListSecurityHotspotsTool(
      "fixture-list-hotspots",
      { projectKey: fixture.projectKey, limit: 2, page: 1 },
      undefined,
      undefined,
      { cwd },
    );
    const hotspot = await executeGetSecurityHotspotTool(
      "fixture-get-hotspot",
      { hotspotKey: fixture.hotspotKey, projectKey: fixture.projectKey },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(summary.details.summary.qualityGateStatus, "ERROR");
    assert.equal(summary.details.summary.metrics.find((metric) => metric.key === "coverage")?.value, "63.4");
    assert.equal(issues.details.pagination.total, 3);
    assert.equal(issues.details.pagination.activeReturned, 1);
    assert.equal(issues.details.pagination.excludedNonActive, 1);
    assert.equal(issues.details.issues[0].key, fixture.issueKey);
    assert.match(issue.details.issue.guidance ?? "", /Sonar-provided section guidance/);
    assert.equal(issue.details.issue.sourceSnippets[1].text, "  doComplexThing(input);");
    assert.equal(issue.details.issue.secondaryLocations[0].file, "src/helper.ts");
    assert.equal(issue.details.issue.flows[0][1].file, "src/helper.ts");
    assert.equal(hotspots.details.pagination.total, 2);
    assert.equal(hotspots.details.pagination.requiringReviewReturned, 1);
    assert.equal(hotspot.details.hotspot.guidance.fixRecommendation, "Sonar fix: use parameterized queries.");
    assert.equal(hotspot.details.hotspot.sourceSnippets[1].text, "db.execute(sql);");
    assert.equal(hotspot.details.hotspot.flows[0][0].file, "src/db.ts");
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("SonarQube 9.9 fallback fixture maps htmlDesc, textRange lines, sourceShow, and colon project keys", async () => {
  const fixture = await loadFixture("sonarqube-9.9-fallbacks.json");
  const issuePayload = fixture.endpoints.issueSearch.issues[0];
  const mapped = mapIssueDetail(issuePayload, fixture.endpoints.ruleShow.rule, fixture.endpoints.sourceShow, {
    projectKey: fixture.projectKey,
  });
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new FixtureRouteFetch(fixture, { sourceIssueSnippetsUnavailable: true });

  assert.equal(mapped.location.file, "src/main/java/App.java");
  assert.equal(mapped.location.line, 58);
  assert.match(mapped.guidance ?? "", /HTML guidance/);
  assert.equal(mapped.sourceSnippets[1].text, "  throw new Exception(message);");
  assert.equal(mapped.secondaryLocations[0].file, "src/main/java/Helper.java");
  assert.equal(mapped.flows[0][0].file, "src/main/java/App.java");

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "fixture-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetIssueTool(
      "fixture-get-issue-fallback",
      { issueKey: fixture.issueKey, projectKey: fixture.projectKey },
      undefined,
      undefined,
      { cwd },
    );

    assert.match(result.content[0].text, /throw new Exception/);
    assert.ok(result.details.requests.sourceAttempts.some((request) => request.path === SONAR_ENDPOINTS.sourceIssueSnippets));
    assert.ok(result.details.requests.sourceAttempts.some((request) => request.path === SONAR_ENDPOINTS.sourceShow));
    assert.ok(result.details.warnings.some((warning) => warning.includes("Source issue snippets unavailable")));
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("SonarCloud hotspot fixture maps top-level guidance, metadata, source arrays, and pagination", async () => {
  const fixture = await loadFixture("sonarcloud-current-hotspots.json");
  const mapped = mapSecurityHotspotDetail(fixture.endpoints.hotspotShow, fixture.endpoints.sourceShow, {
    projectKey: fixture.projectKey,
  });
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new FixtureRouteFetch(fixture);

  assert.equal(mapped.location.file, "src/crypto.ts");
  assert.equal(mapped.guidance.riskDescription, "SonarCloud risk: hard-coded key material may be disclosed.");
  assert.equal(mapped.guidance.fixRecommendation, "SonarCloud fix: load keys from a managed secret store.");
  assert.equal(mapped.sourceSnippets[1].text, "return encrypt(value, key);");
  assert.equal(mapped.secondaryLocations[0].file, "src/config.ts");
  assert.equal(mapped.flows[0][0].file, "src/crypto.ts");

  try {
    applyEnv({ SONARQUBE_URL: "https://sonarcloud.io", SONARQUBE_TOKEN: "fixture-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const listResult = await executeListSecurityHotspotsTool(
      "fixture-list-cloud-hotspots",
      { projectKey: fixture.projectKey, limit: 1, page: 2 },
      undefined,
      undefined,
      { cwd },
    );
    const detailResult = await executeGetSecurityHotspotTool(
      "fixture-get-cloud-hotspot",
      { hotspotKey: fixture.hotspotKey, projectKey: fixture.projectKey },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(listResult.details.pagination.page, 2);
    assert.equal(listResult.details.pagination.total, 4);
    assert.equal(listResult.details.hotspots[0].assignee, "security-reviewer");
    assert.match(detailResult.content[0].text, /managed secret store/);
    assert.equal(detailResult.details.hotspot.sourceSnippets[0].line, 20);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});
