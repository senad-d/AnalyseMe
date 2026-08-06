import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ANALYSEME_TOOL_NAMES } from "../src/constants.ts";
import {
  SCANNER_INSTALL_DOCS_URL,
  buildScannerArgs,
  buildScannerNotFoundMessage,
  detectScannerInstallOptions,
  parseReportTask,
  runScannerProcess,
  validateScannerProperties,
} from "../src/scan/scanner.ts";
import { executeRunScanTool, registerRunScanTool } from "../src/tools/run-scan.ts";

const envKeys = [
  "SONARQUBE_URL",
  "SONARQUBE_TOKEN",
  "SONARQUBE_ORGANIZATION",
  "SONARQUBE_PROJECT_KEY",
  "SONARQUBE_BRANCH",
  "SONARQUBE_PULL_REQUEST",
  "SONARQUBE_ALLOW_INSECURE_HTTP",
  "SONARQUBE_SCANNER_PATH",
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
  return mkdtemp(join(tmpdir(), "analyseme-scan-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

async function writeFakeScanner(cwd, script) {
  const path = join(cwd, "fake-sonar-scanner.sh");
  await writeFile(path, `#!/bin/sh\n${script}\n`, "utf8");
  await chmod(path, 0o755);
  return path;
}

const successScannerScript = [
  'echo "INFO: Scanner configuration file: conf/sonar-scanner.properties"',
  'echo "INFO: token in env: $SONAR_TOKEN"',
  'echo "INFO: host in env: $SONAR_HOST_URL"',
  'printf \'%s\\n\' "$@" > "args.txt"',
  'mkdir -p .scannerwork',
  'cat > .scannerwork/report-task.txt <<EOF',
  "projectKey=demo",
  "serverUrl=https://sonar.example.com",
  "dashboardUrl=https://sonar.example.com/dashboard?id=demo",
  "ceTaskId=AY-task-1",
  "ceTaskUrl=https://sonar.example.com/api/ce/task?id=AY-task-1",
  "EOF",
  'echo "INFO: EXECUTION SUCCESS"',
].join("\n");

test("registers analyseme_run_scan with schema and prompt guidance", () => {
  const tools = [];
  const fakePi = { registerTool: (tool) => tools.push(tool) };

  registerRunScanTool(fakePi);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, ANALYSEME_TOOL_NAMES.runScan);
  assert.match(tools[0].description, /scanner/i);
  assert.equal(tools[0].executionMode, "sequential");
  assert.ok(tools[0].parameters.properties.properties);
  assert.ok(tools[0].parameters.properties.waitForQualityGate);
  assert.ok(tools[0].parameters.properties.timeoutSeconds);
  assert.ok(tools[0].promptSnippet);
  assert.ok(tools[0].promptGuidelines.every((guideline) => guideline.includes(ANALYSEME_TOOL_NAMES.runScan)));
});

test("validateScannerProperties rejects reserved connection and credential keys", () => {
  assert.deepEqual(validateScannerProperties(["sonar.exclusions=**/dist/**"]), ["sonar.exclusions=**/dist/**"]);
  assert.throws(() => validateScannerProperties(["sonar.host.url=https://evil.example.com"]), /managed by AnalyseMe/);
  assert.throws(() => validateScannerProperties(["sonar.token=stolen"]), /managed by AnalyseMe/);
  assert.throws(() => validateScannerProperties(["sonar.login=stolen"]), /managed by AnalyseMe/);
  assert.throws(() => validateScannerProperties(["sonar.password=stolen"]), /managed by AnalyseMe/);
  assert.throws(() => validateScannerProperties(["not a property"]), /key=value/);
});

test("buildScannerArgs places managed properties after tool-input properties", () => {
  const args = buildScannerArgs({
    projectKey: "demo",
    organization: "org",
    branch: "main",
    waitForQualityGate: true,
    properties: ["sonar.exclusions=**/dist/**", "sonar.projectKey=other"],
  });

  assert.deepEqual(args, [
    "-Dsonar.exclusions=**/dist/**",
    "-Dsonar.projectKey=other",
    "-Dsonar.projectKey=demo",
    "-Dsonar.organization=org",
    "-Dsonar.branch.name=main",
    "-Dsonar.qualitygate.wait=true",
  ]);
});

test("parseReportTask reads scanner report values with = inside URLs", () => {
  const reportTask = parseReportTask(
    [
      "projectKey=demo",
      "serverUrl=https://sonar.example.com",
      "dashboardUrl=https://sonar.example.com/dashboard?id=demo",
      "ceTaskId=AY-task-1",
      "ceTaskUrl=https://sonar.example.com/api/ce/task?id=AY-task-1",
      "",
      "# comment",
    ].join("\n"),
  );

  assert.equal(reportTask.projectKey, "demo");
  assert.equal(reportTask.dashboardUrl, "https://sonar.example.com/dashboard?id=demo");
  assert.equal(reportTask.ceTaskId, "AY-task-1");
  assert.equal(reportTask.ceTaskUrl, "https://sonar.example.com/api/ce/task?id=AY-task-1");
});

test("executes analyseme_run_scan with a successful scanner run", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();

  try {
    const scannerPath = await writeFakeScanner(cwd, successScannerScript);
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "scan-secret-token",
      SONARQUBE_SCANNER_PATH: scannerPath,
    });

    const result = await executeRunScanTool(
      "call-1",
      { projectKey: " demo ", organization: "org", branch: "main" },
      undefined,
      undefined,
      { cwd },
    );
    const content = result.content[0].text;
    const serializedDetails = JSON.stringify(result.details);
    const receivedArgs = await readFile(join(cwd, "args.txt"), "utf8");

    assert.match(content, /AnalyseMe scan: demo/);
    assert.match(content, /Outcome: success/);
    assert.match(content, /Analysis upload: confirmed/);
    assert.match(content, /Dashboard: https:\/\/sonar\.example\.com\/dashboard\?id=demo/);
    assert.match(content, /CE task id: AY-task-1/);
    assert.match(content, /EXECUTION SUCCESS/);
    assert.equal(result.details.succeeded, true);
    assert.equal(result.details.execution.exitCode, 0);
    assert.equal(result.details.projectKeySource, "argument");
    assert.equal(result.details.scope, "branch main");
    assert.equal(result.details.reportTask.ceTaskId, "AY-task-1");
    assert.match(receivedArgs, /-Dsonar\.projectKey=demo/);
    assert.match(receivedArgs, /-Dsonar\.organization=org/);
    assert.match(receivedArgs, /-Dsonar\.branch\.name=main/);
    assert.doesNotMatch(receivedArgs, /scan-secret-token/);
    assert.match(content, /host in env: https:\/\/sonar\.example\.com/);
    assert.doesNotMatch(content, /scan-secret-token/);
    assert.doesNotMatch(serializedDetails, /scan-secret-token/);
    assert.match(content, /token in env: \[redacted\]/);
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});

test("reports a failed scanner run with exit code and log tail", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();

  try {
    const scannerPath = await writeFakeScanner(cwd, 'echo "ERROR: Project not provisioned" >&2\nexit 2');
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "scan-secret-token",
      SONARQUBE_SCANNER_PATH: scannerPath,
    });

    const result = await executeRunScanTool("call-2", { projectKey: "demo" }, undefined, undefined, { cwd });
    const content = result.content[0].text;

    assert.match(content, /Outcome: failed \(exit code 2\)/);
    assert.match(content, /Project not provisioned/);
    assert.equal(result.details.succeeded, false);
    assert.equal(result.details.execution.exitCode, 2);
    assert.equal(result.details.reportTask, undefined);
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});

test("throws install guidance when the scanner binary is missing", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "scan-secret-token",
      SONARQUBE_SCANNER_PATH: join(cwd, "missing-scanner"),
    });

    await assert.rejects(
      executeRunScanTool("call-3", { projectKey: "demo" }, undefined, undefined, { cwd }),
      (error) => {
        assert.match(error.message, /was not found/);
        assert.match(error.message, /SONARQUBE_SCANNER_PATH/);
        assert.ok(error.message.includes(SCANNER_INSTALL_DOCS_URL));
        assert.match(error.message, /Offer to run/);
        return true;
      },
    );
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});

test("detectScannerInstallOptions finds package managers on PATH", async () => {
  const cwd = await createTempDir();

  try {
    await writeFile(join(cwd, "brew"), "#!/bin/sh\n", "utf8");
    await chmod(join(cwd, "brew"), 0o755);

    const found = await detectScannerInstallOptions({ PATH: cwd }, "darwin");
    const none = await detectScannerInstallOptions({ PATH: cwd }, "win32");

    assert.deepEqual(found, [{ manager: "Homebrew", installCommand: "brew install sonar-scanner" }]);
    assert.deepEqual(none, []);
  } finally {
    await removeTempDir(cwd);
  }
});

test("buildScannerNotFoundMessage suggests detected managers or manual install", () => {
  const withManager = buildScannerNotFoundMessage(
    "sonar-scanner",
    [{ manager: "Homebrew", installCommand: "brew install sonar-scanner" }],
    "darwin",
  );
  const withoutManager = buildScannerNotFoundMessage("sonar-scanner", [], "linux");

  assert.match(withManager, /Homebrew: brew install sonar-scanner/);
  assert.match(withManager, /Offer to run one of the install commands/);
  assert.ok(withManager.includes(SCANNER_INSTALL_DOCS_URL));
  assert.match(withoutManager, /Download the SonarScanner CLI zip/);
  assert.match(withoutManager, /SONARQUBE_SCANNER_PATH/);
});

test("rejects reserved scanner properties before running the scanner", async () => {
  const cwd = await createTempDir();
  const envSnapshot = snapshotEnv();

  try {
    applyEnv({
      SONARQUBE_URL: "https://sonar.example.com",
      SONARQUBE_TOKEN: "scan-secret-token",
      SONARQUBE_SCANNER_PATH: join(cwd, "never-invoked"),
    });

    await assert.rejects(
      executeRunScanTool(
        "call-4",
        { projectKey: "demo", properties: ["sonar.host.url=https://evil.example.com"] },
        undefined,
        undefined,
        { cwd },
      ),
      /managed by AnalyseMe/,
    );
  } finally {
    restoreEnv(envSnapshot);
    await removeTempDir(cwd);
  }
});

test("runScannerProcess stops a scan that exceeds the timeout", async () => {
  const cwd = await createTempDir();

  try {
    const scannerPath = await writeFakeScanner(cwd, 'echo "INFO: scanning"\nsleep 30');
    const result = await runScannerProcess({
      command: scannerPath,
      args: [],
      cwd,
      env: process.env,
      timeoutMs: 300,
    });

    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.durationMs < 10_000);
    assert.match(result.log, /scanning/);
  } finally {
    await removeTempDir(cwd);
  }
});
