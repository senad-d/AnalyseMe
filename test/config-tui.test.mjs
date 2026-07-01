import assert from "node:assert/strict";
import test from "node:test";

import { SONAR_ENV_VAR_NAMES, SONAR_ENV_VARS } from "../src/constants.ts";
import { buildConfigTuiModel, renderConfigTui } from "../src/ui/config-tui.ts";

function createSources() {
  const sources = {};

  for (const name of SONAR_ENV_VAR_NAMES) {
    sources[name] = { value: undefined, source: "missing" };
  }

  sources[SONAR_ENV_VARS.url] = { value: "https://sonar.example.com", source: "environment" };
  sources[SONAR_ENV_VARS.token] = { value: "super-secret-token", source: "environment" };
  sources[SONAR_ENV_VARS.organization] = { value: "org", source: "env-file" };
  sources[SONAR_ENV_VARS.projectKey] = { value: "my-project", source: "environment" };

  return sources;
}

function createResult(overrides = {}) {
  return {
    sources: createSources(),
    config: {
      url: "https://sonar.example.com",
      token: "super-secret-token",
      organization: "org",
      projectKey: "my-project",
      sources: createSources(),
      tokenDisplay: "present",
    },
    errors: [],
    warnings: [],
    envFile: { path: ".env", exists: true, loadedKeys: [SONAR_ENV_VARS.organization] },
    ...overrides,
  };
}

function assertLineWidths(lines, width) {
  for (const line of lines) {
    assert.ok(line.length <= width, `line too long (${line.length} > ${width}): ${line}`);
  }
}

test("renders compact AnalyseMe config status with current project and masked token", () => {
  const model = buildConfigTuiModel(createResult());
  const lines = renderConfigTui(model, 88);
  const text = lines.join("\n");

  assertLineWidths(lines, 88);
  assert.match(lines[0], /^╭/);
  assert.doesNotMatch(text, /┬|▶/);
  assert.match(text, /✓ Ready to use/);
  assert.match(text, /Connection/);
  assert.match(text, /✓ Sonar URL\s+https:\/\/sonar\.example\.com/);
  assert.match(text, /✓ API token\s+present/);
  assert.match(text, /✓ Project key\s+my-project/);
  assert.match(text, /✓ Organization\s+org/);
  assert.match(text, /· Analysis scope\s+default project scope/);
  assert.doesNotMatch(text, /super-secret-token/);
});

test("renders missing configuration and project key in one simple panel", () => {
  const missingSources = {};

  for (const name of SONAR_ENV_VAR_NAMES) {
    missingSources[name] = { value: undefined, source: "missing" };
  }

  const model = buildConfigTuiModel(
    createResult({
      sources: missingSources,
      config: undefined,
      errors: [
        "Missing required SONARQUBE_URL. Set SONARQUBE_URL in the environment or local .env.",
        "Missing required SONARQUBE_TOKEN. Set SONARQUBE_TOKEN in the environment or local .env.",
      ],
      envFile: { path: ".env", exists: false, loadedKeys: [] },
    }),
  );
  const lines = renderConfigTui(model, 80);
  const text = lines.join("\n");

  assertLineWidths(lines, 80);
  assert.match(text, /Needs setup/);
  assert.match(text, /! Setup incomplete/);
  assert.match(text, /! Sonar URL\s+missing/);
  assert.match(text, /! API token\s+not set/);
  assert.match(text, /! Project key\s+not configured/);
  assert.match(text, /! Set a valid SONARQUBE_URL/);
  assert.match(text, /! Set SONARQUBE_TOKEN/);
});

test("renders tiny AnalyseMe config TUI without borders", () => {
  const model = buildConfigTuiModel(createResult({ errors: ["missing config"], config: undefined }));
  const lines = renderConfigTui(model, 20);

  assert.equal(lines.length, 4);
  assertLineWidths(lines, 20);
  assert.doesNotMatch(lines.join("\n"), /[╭╮╰╯│]/);
  assert.match(lines[0], /AnalyseMe/);
  assert.match(lines[1], /Needs setup/);
});
