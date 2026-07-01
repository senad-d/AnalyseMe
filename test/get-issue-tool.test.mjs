import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import { executeGetIssueTool, registerGetIssueTool } from "../src/tools/get-issue.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
];

class GetIssueRouteFetch {
  calls = [];
  handler;

  constructor(handler) {
    this.handler = handler;
  }

  async fetch(url, init) {
    this.calls.push({ url, init });
    return this.handler(url, init);
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function abortError(message = "The operation was aborted.") {
  const error = new Error(message);
  error.name = "AbortError";

  return error;
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
  return mkdtemp(join(tmpdir(), "analyseme-get-issue-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

function detailedIssue(overrides = {}) {
  return {
    key: "ISSUE-1",
    message: "Avoid this issue",
    severity: "CRITICAL",
    type: "BUG",
    issueStatus: "OPEN",
    rule: "typescript:S123",
    component: "demo:src/index.ts",
    line: 12,
    textRange: { startLine: 12, endLine: 12, startOffset: 4, endOffset: 19 },
    impacts: [{ softwareQuality: "RELIABILITY", severity: "HIGH" }],
    secondaryLocations: [{ component: "demo:src/helper.ts", line: 4 }],
    flows: [{ locations: [{ component: "demo:src/flow.ts", textRange: { startLine: 7, endLine: 7 } }] }],
    ...overrides,
  };
}

test("registers analyseme_get_issue with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerGetIssueTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.getIssue);
  assert.ok(tools[0].parameters.properties.issueKey);
  assert.equal(tools[0].parameters.properties.issueKey.minLength, 1);
  assert.ok(tools[0].parameters.properties.projectKey);
  assert.ok(tools[0].promptSnippet);
  assert.ok(tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.getIssue)));
});

test("executes analyseme_get_issue with issue, source, flow, and Sonar rule guidance", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue()] });
    if (url.includes("/api/rules/show")) {
      return jsonResponse({
        rule: {
          key: "typescript:S123",
          name: "Rule name",
          descriptionSections: [{ key: "how_to_fix", content: "Sonar-provided guidance." }],
        },
      });
    }
    if (url.includes("/api/sources/issue_snippets")) {
      return jsonResponse({
        issueSnippets: [
          {
            component: "demo:src/index.ts",
            sources: [
              { line: 11, code: "const value = 1;" },
              { line: 12, code: "doThing(value);" },
            ],
          },
        ],
      });
    }

    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "issue-secret-token",
      SONARQUBE_ORGANIZATION: "env-org",
    });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetIssueTool(
      "call-get-issue",
      { issueKey: " ISSUE-1 ", projectKey: " demo ", organization: " arg-org ", branch: " main " },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);

    assert.match(content, /AnalyseMe issue: ISSUE-1/);
    assert.match(content, /RELIABILITY:HIGH/);
    assert.match(content, /demo:src\/index.ts \(src\/index.ts\):12/);
    assert.match(content, /doThing\(value\);/);
    assert.match(content, /demo:src\/helper.ts \(src\/helper.ts\):4/);
    assert.match(content, /Flow 1/);
    assert.match(content, /Sonar-provided guidance/);
    assert.equal(result.details.issue.ruleName, "Rule name");
    assert.equal(result.details.issue.sourceSnippets.length, 2);
    assert.equal(result.details.issue.secondaryLocations.length, 1);
    assert.equal(result.details.issue.flows.length, 1);
    assert.equal(result.details.issueKey, "ISSUE-1");
    assert.equal(result.details.projectKey, "demo");
    assert.equal(result.details.organization, "arg-org");
    assert.equal(result.details.scope, "branch main");
    assert.match(result.details.links.issue ?? "", /issues=ISSUE-1/);
    assert.match(result.details.links.rule ?? "", /rule_key=typescript%3AS123/);
    assert.equal(result.details.requests.sourceAttempts.length, 1);
    assert.equal(routeFetch.calls.length, 3);
    assert.doesNotMatch(serializedDetails, /issue-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue falls back to textRange.startLine for source context", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) {
      return jsonResponse({ issues: [detailedIssue({ line: undefined, textRange: { startLine: 44, endLine: 44 } })] });
    }
    if (url.includes("/api/rules/show")) return jsonResponse({ rule: { key: "typescript:S123", name: "Rule name" } });
    if (url.includes("/api/sources/issue_snippets")) return jsonResponse({ errors: [{ msg: "not available" }] }, 404);
    if (url.includes("/api/sources/show")) {
      return jsonResponse({ sources: [{ line: 44, code: "doThingFromFallback();" }] });
    }

    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetIssueTool(
      "call-get-issue-text-range",
      { issueKey: "ISSUE-1", projectKey: "demo" },
      undefined,
      undefined,
      { cwd },
    );
    const sourceShowCall = routeFetch.calls.find((call) => call.url.includes("/api/sources/show"));

    assert.ok(sourceShowCall);
    assert.match(sourceShowCall.url, /from=41/);
    assert.match(sourceShowCall.url, /to=47/);
    assert.match(result.content[0].text, /doThingFromFallback/);
    assert.equal(result.details.requests.sourceAttempts.length, 2);
    assert.ok(result.details.requests.sourceAttempts.some((request) => request.path === "/api/sources/show"));
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue rejects empty issue keys before Sonar requests", async () => {
  const cwd = await createTempDir();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch(() => jsonResponse({ errors: [{ msg: "fetch should not run" }] }, 500));

  try {
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetIssueTool("call-get-issue-empty", { issueKey: "   " }, undefined, undefined, { cwd }),
      /issueKey is required and must be a non-empty string/,
    );
    assert.equal(routeFetch.calls.length, 0);
  } finally {
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue throws when the issue is not found", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [] });
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetIssueTool("call-get-issue", { issueKey: "MISSING" }, undefined, undefined, { cwd }),
      /Sonar issue MISSING was not found/,
    );
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue rejects detail responses for a different issue key", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue({ key: "OTHER-ISSUE" })] });
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetIssueTool("call-get-issue", { issueKey: "ISSUE-1" }, undefined, undefined, { cwd }),
      /Sonar issue ISSUE-1 was not found in the issue detail response/,
    );
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue reports missing source context and missing rule guidance without inventing advice", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue({ component: undefined, line: undefined })] });
    if (url.includes("/api/rules/show")) return jsonResponse({ rule: { key: "typescript:S123", name: "Rule without guidance" } });
    if (url.includes("/api/sources/issue_snippets")) return jsonResponse({ errors: [{ msg: "not available" }] }, 404);
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetIssueTool("call-get-issue", { issueKey: "ISSUE-1" }, undefined, undefined, { cwd });
    const content = result.content[0].text;

    assert.match(content, /Source\/location snippets unavailable from Sonar/);
    assert.match(content, /Sonar did not return rule guidance/);
    assert.doesNotMatch(content, /You should|Try to|Fix by/);
    assert.ok(result.details.warnings.some((warning) => warning.includes("Source issue snippets unavailable")));
    assert.ok(result.details.warnings.some((warning) => warning.includes("Source fallback unavailable")));
    assert.equal(result.details.issue.guidance, undefined);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue preserves abort from optional rule metadata", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const controller = new AbortController();
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue()] });
    if (url.includes("/api/rules/show")) {
      controller.abort();
      throw abortError();
    }
    if (url.includes("/api/sources/")) return jsonResponse({ errors: [{ msg: "source should not run" }] }, 500);
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetIssueTool("call-get-issue-abort-rule", { issueKey: "ISSUE-1" }, controller.signal, undefined, { cwd }),
      (error) => error instanceof Error && error.name === "AbortError",
    );
    assert.ok(routeFetch.calls.some((call) => call.url.includes("/api/rules/show")));
    assert.equal(routeFetch.calls.some((call) => call.url.includes("/api/sources/")), false);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue preserves abort from optional source snippets and skips fallback", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const controller = new AbortController();
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue()] });
    if (url.includes("/api/rules/show")) return jsonResponse({ rule: { key: "typescript:S123", name: "Rule name" } });
    if (url.includes("/api/sources/issue_snippets")) {
      controller.abort();
      throw abortError();
    }
    if (url.includes("/api/sources/show")) return jsonResponse({ errors: [{ msg: "fallback should not run" }] }, 500);
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    await assert.rejects(
      executeGetIssueTool("call-get-issue-abort-source", { issueKey: "ISSUE-1" }, controller.signal, undefined, { cwd }),
      (error) => error instanceof Error && error.name === "AbortError",
    );
    assert.ok(routeFetch.calls.some((call) => call.url.includes("/api/sources/issue_snippets")));
    assert.equal(routeFetch.calls.some((call) => call.url.includes("/api/sources/show")), false);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("analyseme_get_issue includes visible field truncation metadata for long rule guidance", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const routeFetch = new GetIssueRouteFetch((url) => {
    if (url.includes("/api/issues/search")) return jsonResponse({ issues: [detailedIssue()] });
    if (url.includes("/api/rules/show")) {
      return jsonResponse({ rule: { key: "typescript:S123", name: "Long guidance", htmlDesc: "x".repeat(70_000) } });
    }
    if (url.includes("/api/sources/issue_snippets")) return jsonResponse({ issueSnippets: [] });
    return jsonResponse({ errors: [{ msg: "unexpected path" }] }, 404);
  });

  try {
    applyEnv({ SONARQUBE_URL: "https://sonar.example.com", SONARQUBE_TOKEN: "issue-secret-token" });
    globalThis.fetch = routeFetch.fetch.bind(routeFetch);

    const result = await executeGetIssueTool(
      "call-get-issue-long",
      { issueKey: "ISSUE-1", projectKey: "demo" },
      undefined,
      undefined,
      { cwd },
    );

    assert.ok(result.details.textSafety.truncatedFields > 0);
    assert.match(result.content[0].text, /AnalyseMe field truncated/);
    assert.match(result.details.issue.guidance ?? "", /AnalyseMe field truncated/);
    assert.ok((result.details.issue.guidance ?? "").length <= 8_000);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});
