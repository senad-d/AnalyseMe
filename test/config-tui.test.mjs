import assert from "node:assert/strict";
import test from "node:test";

import { SONAR_ENV_VAR_NAMES, SONAR_ENV_VARS } from "../src/constants.ts";
import { ConfigTuiComponent, buildConfigTuiModel, renderConfigTui } from "../src/ui/config-tui.ts";

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
  const sources = createSources();

  return {
    sources,
    config: {
      url: "https://sonar.example.com",
      token: "super-secret-token",
      organization: "org",
      projectKey: "my-project",
      sources,
      tokenDisplay: "present",
    },
    errors: [],
    warnings: [],
    envFile: { path: ".env", exists: true, loadedKeys: [SONAR_ENV_VARS.organization] },
    ...overrides,
  };
}

function createMissingSources() {
  const sources = {};

  for (const name of SONAR_ENV_VAR_NAMES) {
    sources[name] = { value: undefined, source: "missing" };
  }

  return sources;
}

function assertLineWidths(lines, width) {
  for (const line of lines) {
    assert.ok(line.length <= width, `line too long (${line.length} > ${width}): ${line}`);
  }
}

function createTaggedTheme() {
  return {
    fg: (color, text) => `<${color}>${text}</${color}>`,
    bold: (text) => `<bold>${text}</bold>`,
  };
}

function stripThemeTags(value) {
  return value.replaceAll(/<\/?(?:accent|muted|dim|success|warning|bold)>/g, "");
}

function assertVisibleLineWidths(lines, width) {
  assertLineWidths(lines.map(stripThemeTags), width);
}

test("renders wide two-pane AnalyseMe info panel without notes or tab help", () => {
  const model = buildConfigTuiModel(createResult());
  const lines = renderConfigTui(model, 88);
  const text = lines.join("\n");
  const sonarUrlLine = lines.find((line) => line.includes("Sonar URL")) ?? "";

  assertLineWidths(lines, 88);
  assert.match(lines[0], /^╭─ AnalyseMe .* Ready ─╮$/);
  assert.match(text, /read-only status • environment and local \.env may apply/);
  assert.match(text, /↑↓ section {2}q quit/);
  assert.doesNotMatch(text, /Tab pane|Enter details|search|Notes/);
  assert.match(text, /┬/);
  assert.match(text, /┴/);
  assert.match(text, /▶ Connection/);
  assert.match(text, /CONNECTION\s+2 items/);
  assert.match(sonarUrlLine, /Sonar URL\s+https:\/\/sonar\.example\.com/);
  assert.doesNotMatch(sonarUrlLine, /▶/);
  assert.match(text, /API token\s+present/);
  assert.match(text, /1\/2 • Sonar endpoint and masked API token status/);
  assert.doesNotMatch(text, /super-secret-token/);
});

test("renders missing configuration with a read-only setup warning category", () => {
  const missingSources = createMissingSources();
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
  const setupLines = renderConfigTui(model, 80, { categoryIndex: 2 });
  const setupText = setupLines.join("\n");

  assertLineWidths(setupLines, 80);
  assert.match(setupText, /Needs setup/);
  assert.match(setupText, /▶ What to fix/);
  assert.match(setupText, /WHAT TO FIX\s+2 items/);
  assert.match(setupText, /SONARQUBE_URL\s+missing/);
  assert.match(setupText, /SONARQUBE_TOKEN\s+missing/);
  assert.doesNotMatch(setupText, /▶ SONARQUBE_URL/);
  assert.match(setupText, /3\/3 • Local setup issues and warnings/);
});

test("renders narrow one-pane read-only information", () => {
  const model = buildConfigTuiModel(createResult());
  const lines = renderConfigTui(model, 50);
  const text = lines.join("\n");

  assertLineWidths(lines, 50);
  assert.doesNotMatch(text, /┬|┴/);
  assert.match(text, /↑↓ section {2}q quit/);
  assert.doesNotMatch(text, /Tab pane|Enter details|Notes/);
  assert.match(text, /CONNECTION\s+2 items/);
  assert.match(text, /Sonar URL\s+.*sonar\.example\.com/);
  assert.match(text, /API token\s+present/);
  assert.match(text, /1\/2 • Sonar endpoint and masked API token statu/);
  assert.doesNotMatch(text, /super-secret-token/);
});

test("renders tiny AnalyseMe config TUI as a four-line borderless fallback", () => {
  const model = buildConfigTuiModel(createResult({ errors: ["missing config"], config: undefined }));
  const lines = renderConfigTui(model, 20);

  assert.equal(lines.length, 4);
  assertLineWidths(lines, 20);
  assert.doesNotMatch(lines.join("\n"), /[╭╮╰╯│]/);
  assert.match(lines[0], /AnalyseMe/);
  assert.match(lines[1], /Needs setup/);
  assert.match(lines[2], /Action 1: missing/);
  assert.match(lines[3], /q quit/);
});

test("applies semantic theme roles to focused and inactive selections", () => {
  const model = buildConfigTuiModel(createResult());
  const lines = renderConfigTui(model, 88, { focus: "settings", theme: createTaggedTheme() });
  const text = lines.join("\n");

  assertVisibleLineWidths(lines, 88);
  assert.match(text, /<accent>╭─ AnalyseMe .* Ready ─╮<\/accent>/);
  assert.match(text, /<muted>▶ <\/muted><muted>Connection\s*<\/muted>/);
  assert.match(text, /<accent>▶ <\/accent><accent><bold>Sonar URL\s*<\/bold><\/accent>/);
  assert.match(text, /<success>\s*https:\/\/sonar\.example\.com<\/success>/);
  assert.match(text, /<dim>↑↓ section {2}q quit\s*<\/dim>/);
});

test("handles section navigation and close keys predictably", () => {
  const model = buildConfigTuiModel(createResult());
  let doneCalled = false;
  const component = new ConfigTuiComponent(model, () => { doneCalled = true; });

  assert.match(component.render(80).join("\n"), /1\/2 • Sonar endpoint/);

  component.handleInput("\t");
  assert.match(component.render(80).join("\n"), /1\/2 • Sonar endpoint/);

  component.handleInput("\u001b[B");
  assert.match(component.render(80).join("\n"), /2\/2 • Default project key/);

  component.handleInput("\u001b");
  assert.equal(doneCalled, true);
});

test("uses injected Pi keybindings and requests TUI rerender after navigation", () => {
  const model = buildConfigTuiModel(createResult());
  let renderRequests = 0;
  let doneCalled = false;
  const keybindings = {
    matches(data, keybinding) {
      if (data === "custom-down") return keybinding === "tui.select.down";
      if (data === "custom-up") return keybinding === "tui.select.up";
      if (data === "custom-close") return keybinding === "tui.select.cancel";
      return false;
    },
  };
  const component = new ConfigTuiComponent(model, () => { doneCalled = true; }, {
    keybindings,
    requestRender: () => { renderRequests += 1; },
  });

  component.handleInput("custom-down");
  assert.match(component.render(80).join("\n"), /2\/2 • Default project key/);
  assert.equal(renderRequests, 1);

  component.handleInput("custom-up");
  assert.match(component.render(80).join("\n"), /1\/2 • Sonar endpoint/);
  assert.equal(renderRequests, 2);

  component.handleInput("custom-close");
  assert.equal(doneCalled, true);
});
