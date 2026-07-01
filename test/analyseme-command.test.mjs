import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_COMMAND, ANALYSEME_TOOL_NAMES, SONAR_ENV_VARS } from "../src/constants.ts";
import { buildAnalyseMeHelpText, registerAnalyseMeCommand } from "../src/commands/analyseme.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
];

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
  return mkdtemp(join(tmpdir(), "analyseme-command-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

test("builds /analyseme help text with config, CI, tools, and read-only guidance", () => {
  const help = buildAnalyseMeHelpText("help");

  assert.match(help, /# AnalyseMe help/);
  assert.match(help, new RegExp(SONAR_ENV_VARS.url));
  assert.match(help, new RegExp(SONAR_ENV_VARS.token));
  assert.match(help, /Local `.env` example/);
  assert.match(help, /GitHub Actions example/);
  assert.match(help, /Project key resolution order/);
  assert.match(help, /Analysis scope resolution order/);
  assert.match(help, /SONARQUBE_ALLOW_INSECURE_HTTP/);
  assert.match(help, /read-only/);
  assert.match(help, new RegExp(ANALYSEME_TOOL_NAMES.getProjectSummary));
  assert.match(help, new RegExp(ANALYSEME_TOOL_NAMES.listIssues));
  assert.match(help, new RegExp(ANALYSEME_TOOL_NAMES.getIssue));
  assert.match(help, new RegExp(ANALYSEME_TOOL_NAMES.listSecurityHotspots));
  assert.match(help, new RegExp(ANALYSEME_TOOL_NAMES.getSecurityHotspot));
  assert.doesNotMatch(help, /real-token|secret-token/);
});

test("registers /analyseme help command and sends text without credentials or network", async () => {
  const commands = [];
  const messages = [];
  const fetchSnapshot = globalThis.fetch;
  const fakePi = {
    registerCommand: (name, options) => commands.push({ name, options }),
    sendMessage: (message, options) => messages.push({ message, options }),
  };

  try {
    globalThis.fetch = async () => {
      throw new Error("help should not use network");
    };

    registerAnalyseMeCommand(fakePi);
    await commands[0].options.handler("help", { mode: "json", hasUI: false });

    assert.equal(commands.length, 1);
    assert.equal(commands[0].name, ANALYSEME_COMMAND);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].message.customType, "analyseme-help");
    assert.equal(messages[0].message.display, true);
    assert.equal(messages[0].message.details.readOnly, true);
    assert.deepEqual(messages[0].message.details.tools, Object.values(ANALYSEME_TOOL_NAMES));
    assert.match(messages[0].message.content, /Use `\/analyseme help` any time/);
    assert.equal(messages[0].options.triggerTurn, false);
    assert.equal(messages[0].options.deliverAs, undefined);
  } finally {
    globalThis.fetch = fetchSnapshot;
  }
});

test("/analyseme help handles unknown arguments with help text", () => {
  const help = buildAnalyseMeHelpText("unknown");

  assert.match(help, /Unknown argument: unknown/);
  assert.match(help, /## Tools/);
});

test("/analyseme sends read-only config TUI without network or token disclosure", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const fetchSnapshot = globalThis.fetch;
  const commands = [];
  const messages = [];
  const fakePi = {
    registerCommand: (name, options) => commands.push({ name, options }),
    sendMessage: (message, options) => messages.push({ message, options }),
  };

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "command-secret-token",
    });
    globalThis.fetch = async () => {
      throw new Error("config TUI should not use network");
    };

    registerAnalyseMeCommand(fakePi);
    await commands[0].options.handler("", { mode: "json", hasUI: false, cwd });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].message.customType, "analyseme-config");
    assert.equal(messages[0].message.display, true);
    assert.equal(messages[0].message.details.readOnly, true);
    assert.match(messages[0].message.content, /AnalyseMe/);
    assert.match(messages[0].message.content, /Connection/);
    assert.match(messages[0].message.content, /API token\s+present/);
    assert.match(messages[0].message.content, /Project key\s+not configured/);
    assert.doesNotMatch(messages[0].message.content, /command-secret-token/);
    assert.equal(messages[0].options.triggerTurn, false);
    assert.equal(messages[0].options.deliverAs, undefined);
  } finally {
    restoreEnv(envSnapshot);
    globalThis.fetch = fetchSnapshot;
    await removeTempDir(cwd);
  }
});

test("/analyseme surfaces explicitly allowed non-TLS HTTP without token disclosure", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const commands = [];
  const messages = [];
  const fakePi = {
    registerCommand: (name, options) => commands.push({ name, options }),
    sendMessage: (message, options) => messages.push({ message, options }),
  };

  try {
    applyEnv({
      SONARQUBE_URL: "http://sonar.example.com",
      SONARQUBE_TOKEN: "command-secret-token",
      SONARQUBE_ALLOW_INSECURE_HTTP: "true",
    });

    registerAnalyseMeCommand(fakePi);
    await commands[0].options.handler("", { mode: "json", hasUI: false, cwd });

    assert.equal(messages.length, 1);
    assert.match(messages[0].message.content, /non-TLS HTTP allowed/);
    assert.match(messages[0].message.content, /SONARQUBE_URL uses non-TLS HTTP/);
    assert.doesNotMatch(messages[0].message.content, /command-secret-token/);
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});

test("/analyseme opens an interactive custom TUI in TUI mode", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();
  const commands = [];
  const messages = [];
  const fakePi = {
    registerCommand: (name, options) => commands.push({ name, options }),
    sendMessage: (message, options) => messages.push({ message, options }),
  };
  let component;
  let doneCalled = false;

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "command-secret-token",
    });

    registerAnalyseMeCommand(fakePi);
    await commands[0].options.handler("", {
      mode: "tui",
      hasUI: true,
      cwd,
      ui: {
        custom: async (factory) => {
          component = await factory(
            {},
            {},
            {},
            () => { doneCalled = true; },
          );
        },
      },
    });

    assert.equal(messages.length, 0);
    assert.ok(component);
    assert.match(component.render(80).join("\n"), /AnalyseMe/);
    assert.match(component.render(80).join("\n"), /Project key\s+not configured/);

    component.handleInput("q");
    assert.equal(doneCalled, true);
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});
