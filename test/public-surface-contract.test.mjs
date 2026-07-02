import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ANALYSEME_COMMAND, ANALYSEME_TOOL_NAMES } from "../src/constants.ts";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

class PublicSurfaceApi {
  tools = [];
  commands = [];
  events = [];

  registerTool(tool) {
    this.tools.push(tool);
  }

  registerCommand(name, command) {
    this.commands.push({ name, command });
  }

  on(eventName, handler) {
    this.events.push({ eventName, handler });
  }
}

const expectedToolSchemaFields = {
  [ANALYSEME_TOOL_NAMES.getProjectSummary]: ["projectKey", "organization", "branch", "pullRequest"],
  [ANALYSEME_TOOL_NAMES.listIssues]: ["projectKey", "organization", "branch", "pullRequest", "limit", "page"],
  [ANALYSEME_TOOL_NAMES.getIssue]: ["issueKey", "projectKey", "organization", "branch", "pullRequest"],
  [ANALYSEME_TOOL_NAMES.listSecurityHotspots]: ["projectKey", "organization", "branch", "pullRequest", "limit", "page"],
  [ANALYSEME_TOOL_NAMES.getSecurityHotspot]: ["hotspotKey", "projectKey", "organization", "branch", "pullRequest"],
};

function extensionEntryUrlFromManifest() {
  assert.deepEqual(packageJson.pi?.extensions, ["./src/extension.ts"]);

  const extensionPath = packageJson.pi.extensions[0];
  assert.equal(typeof extensionPath, "string");

  return new URL(`../${extensionPath.replace(/^\.\//, "")}`, import.meta.url);
}

function assertToolContract(tool) {
  assert.equal(typeof tool.label, "string");
  assert.match(tool.description, /read|Sonar/i);
  assert.equal(typeof tool.execute, "function");
  assert.equal(tool.parameters?.type, "object");
  assert.ok(tool.parameters?.properties, `${tool.name} should declare a TypeBox object schema`);
  assert.equal(typeof tool.promptSnippet, "string");
  assert.ok(tool.promptSnippet.length > 0);
  assert.ok(Array.isArray(tool.promptGuidelines));
  assert.ok(tool.promptGuidelines.length > 0);
  assert.ok(
    tool.promptGuidelines.every((guideline) => guideline.includes(tool.name)),
    `${tool.name} prompt guidelines should name the tool explicitly`,
  );

  for (const fieldName of expectedToolSchemaFields[tool.name]) {
    assert.ok(tool.parameters.properties[fieldName], `${tool.name} missing schema field ${fieldName}`);
  }
}

test("package Pi entry loads and registers the public AnalyseMe command and tools", async () => {
  const extensionModule = await import(extensionEntryUrlFromManifest().href);
  const api = new PublicSurfaceApi();

  assert.equal(typeof extensionModule.default, "function");
  extensionModule.default(api);

  assert.deepEqual(
    api.tools.map((tool) => tool.name),
    Object.values(ANALYSEME_TOOL_NAMES),
  );
  assert.deepEqual(api.commands.map((entry) => entry.name), [ANALYSEME_COMMAND]);
  assert.deepEqual(api.events.map((entry) => entry.eventName), ["session_start", "session_shutdown"]);

  for (const tool of api.tools) assertToolContract(tool);

  const analyseMeCommand = api.commands[0].command;
  assert.match(analyseMeCommand.description, /AnalyseMe|configuration|setup/i);
  assert.equal(typeof analyseMeCommand.handler, "function");
});
