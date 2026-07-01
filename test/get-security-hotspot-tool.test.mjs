import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import {
  executeGetSecurityHotspotTool,
  registerGetSecurityHotspotTool,
} from "../src/tools/get-security-hotspot.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
];

class GetHotspotRouteFetch {
  calls = [];
  handler;

  constructor(handler) {
    this.handler = handler;
  }

  async fetch(url, init) {
    this.calls.push({ url, init });
    return this.handler(url);
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status });
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
  return mkdtemp(join(tmpdir(), "analyseme-get-hotspot-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

function detailedHotspot(overrides = {}) {
  return {
    key: "HOTSPOT-1",
    message: "Review this security-sensitive code",
    status: "TO_REVIEW",
    vulnerabilityProbability: "HIGH",
    securityCategory: "sql-injection",
    component: "demo:src/db.ts",
    line: 33,
    textRange: { startLine: 33, endLine: 33, startOffset: 2, endOffset: 18 },
    rule: {
      riskDescription: "Risk from Sonar.",
      vulnerabilityDescription: "Vulnerability details from Sonar.",
      fixRecommendation: "Fix recommendation from Sonar.",
    },
    secondaryLocations: [{ component: "demo:src/query.ts", line: 8 }],
    flows: [{ locations: [{ component: "demo:src/flow.ts", textRange: { startLine: 7, endLine: 7 } }] }],
    ...overrides,
  };
}

test("registers analyseme_get_security_hotspot with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerGetSecurityHotspotTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.getSecurityHotspot);
  assert.ok(tools[0].parameters.properties.hotspotKey);
  assert.ok(tools[0].parameters.properties.projectKey);
  assert.ok(tools[0].promptSnippet);
  assert.ok(
    tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.getSecurityHotspot)),
  );
});

test("executes analyseme_get_security_hotspot with source, flow, and Sonar security guidance", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetHotspotRouteFetch((url) => {
    if (url.includes("/api/hotspots/show")) return jsonResponse(detailedHotspot());
    if (url.includes("/api/sources/show")) {
      return jsonResponse({
        sources: [
          { line: 32, code: "const query = input;" },
          { line: 33, code: "db.execute(query);" },
        ],
      });
    }

    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "hotspot-secret-token",
      SONARQUBE_ORGANIZATION: "env-org",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetSecurityHotspotTool(
      "call-get-hotspot",
      { hotspotKey: "HOTSPOT-1", projectKey: "demo", organization: "arg-org", pullRequest: "19" },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);

    assert.match(content, /AnalyseMe security hotspot: HOTSPOT-1/);
    assert.match(content, /Vulnerability probability: HIGH/);
    assert.match(content, /Security category: sql-injection/);
    assert.match(content, /demo:src\/db.ts \(src\/db.ts\):33/);
    assert.match(content, /db.execute\(query\);/);
    assert.match(content, /demo:src\/query.ts \(src\/query.ts\):8/);
    assert.match(content, /Flow 1/);
    assert.match(content, /Risk from Sonar/);
    assert.match(content, /Fix recommendation from Sonar/);
    assert.equal(result.details.hotspot.sourceSnippets.length, 2);
    assert.equal(result.details.hotspot.secondaryLocations.length, 1);
    assert.equal(result.details.hotspot.flows.length, 1);
    assert.equal(result.details.scope, "pull request 19");
    assert.match(result.details.links.hotspot ?? "", /hotspots=HOTSPOT-1/);
    assert.equal(result.details.requests.sourceAttempts.length, 1);
    assert.equal(routeFetch.calls.length, 2);
    assert.match(routeFetch.calls[0].url, /hotspot=HOTSPOT-1/);
    assert.match(routeFetch.calls[0].url, /pullRequest=19/);
    assert.doesNotMatch(serializedDetails, /hotspot-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_security_hotspot throws when the hotspot is not found", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetHotspotRouteFetch((url) => {
    if (url.includes("/api/hotspots/show")) return jsonResponse({});
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "hotspot-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetSecurityHotspotTool("call-get-hotspot", { hotspotKey: "MISSING" }, undefined, undefined, { cwd }),
      /Sonar security hotspot MISSING was not found/,
    );
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_security_hotspot reports missing source context and guidance without inventing advice", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetHotspotRouteFetch((url) => {
    if (url.includes("/api/hotspots/show")) {
      return jsonResponse(detailedHotspot({ component: undefined, line: undefined, rule: {} }));
    }

    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "hotspot-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetSecurityHotspotTool(
      "call-get-hotspot",
      { hotspotKey: "HOTSPOT-1" },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;

    assert.match(content, /Source context unavailable from Sonar/);
    assert.match(content, /Sonar did not return security guidance/);
    assert.doesNotMatch(content, /You should|Try to|Fix by/);
    assert.ok(result.details.warnings.some((warning) => warning.includes("Source context unavailable")));
    assert.equal(result.details.hotspot.guidance.fixRecommendation, undefined);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_security_hotspot includes visible truncation metadata for long guidance", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetHotspotRouteFetch((url) => {
    if (url.includes("/api/hotspots/show")) {
      return jsonResponse(
        detailedHotspot({ rule: { riskDescription: "x".repeat(70_000), fixRecommendation: "Sonar fix" } }),
      );
    }
    if (url.includes("/api/sources/show")) return jsonResponse({ sources: [] });
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "hotspot-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetSecurityHotspotTool(
      "call-get-hotspot-long",
      { hotspotKey: "HOTSPOT-1", projectKey: "demo" },
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
