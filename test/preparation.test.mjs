import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extensionSource = await readFile(new URL("../src/extension.ts", import.meta.url), "utf8");

const skeletonFiles = [
  "../src/config/load-config.ts",
  "../src/config/project-key.ts",
  "../src/config/analysis-scope.ts",
  "../src/config/git-diagnostics.ts",
  "../src/config/types.ts",
  "../src/sonar/client.ts",
  "../src/sonar/endpoints.ts",
  "../src/sonar/issue-mapping.ts",
  "../src/sonar/hotspot-mapping.ts",
  "../src/sonar/project-mapping.ts",
  "../src/tools/project-summary.ts",
  "../src/tools/list-issues.ts",
  "../src/tools/get-issue.ts",
  "../src/tools/list-security-hotspots.ts",
  "../src/tools/get-security-hotspot.ts",
  "../src/commands/analyseme.ts",
  "../src/ui/config-tui.ts",
  "../src/utils/truncation.ts",
  "../src/utils/mask.ts",
];

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

test("extension entry point delegates only to implemented registrations", () => {
  assert.match(extensionSource, /analyseMeExtension/);
  assert.match(extensionSource, /registerProjectSummaryTool\(pi\)/);
  assert.doesNotMatch(extensionSource, /registerExampleCommand|registerExampleTool|template_greet|template-hello/);
  assert.doesNotMatch(extensionSource, /\.registerTool\(|\.registerCommand\(|\.on\(/);
});

test("runtime skeleton files exist for planned implementation areas", async () => {
  for (const path of skeletonFiles) {
    await access(new URL(path, import.meta.url));
  }
});

test("approved project brief and implementation specs exist", async () => {
  const brief = await readText("../docs/PROJECT_DEFINITION_BRIEF.md");
  assert.match(brief, /@senad-d\/pi-analyseme/);
  assert.match(brief, /analyseme_get_project_summary/);

  const architecture = await readText("../specs/spec-architecture.md");
  const guidelines = await readText("../specs/spec-guidelines.md");
  const tasks = await readText("../specs/spec-tasks.md");

  assert.match(architecture, /SonarQube\/SonarCloud/);
  assert.match(guidelines, /SONARQUBE_TOKEN/);
  assert.match(tasks, /- \[[ x]\] Implement and register the `analyseme_get_issue` Pi tool\./);
});
