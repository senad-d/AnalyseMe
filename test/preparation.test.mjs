import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extensionSource = await readFile(new URL("../src/extension.ts", import.meta.url), "utf8");

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("package declares AnalyseMe identity and Pi extension entry file", async () => {
  assert.equal(packageJson.name, "@senad-d/pi-analyseme");
  assert.match(packageJson.description, /SonarQube|SonarCloud/);
  assert.deepEqual(packageJson.pi?.extensions, ["./src/extension.ts"]);
  assert.ok(!packageJson._template, "template metadata should be removed before publishing");
  await access(new URL("../src/extension.ts", import.meta.url));
});

test("prepared extension is intentionally inert until implementation", () => {
  assert.match(extensionSource, /analyseMeExtension/);
  assert.match(extensionSource, /Intentionally inert during project preparation/);
  assert.doesNotMatch(extensionSource, /registerExampleCommand|registerExampleTool|template_greet|template-hello/);
});

test("approved project brief and three implementation specs exist", async () => {
  const brief = await readText("../docs/PROJECT_DEFINITION_BRIEF.md");
  assert.match(brief, /@senad-d\/pi-analyseme/);
  assert.match(brief, /analyseme_get_project_summary/);

  const architecture = await readText("../specs/spec-architecture.md");
  const guidelines = await readText("../specs/spec-guidelines.md");
  const tasks = await readText("../specs/spec-tasks.md");

  assert.match(architecture, /SonarQube\/SonarCloud/);
  assert.match(guidelines, /SONARQUBE_TOKEN/);
  assert.match(tasks, /- \[ \] Implement and register the `analyseme_get_issue` Pi tool\./);
});

test("task spec keeps all implementation tasks unchecked", async () => {
  const tasks = await readText("../specs/spec-tasks.md");
  assert.doesNotMatch(tasks, /^- \[x\]/im);
  assert.match(tasks, /^- \[ \]/im);
});
