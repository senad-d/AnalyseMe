import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveAnalysisScope } from "../src/config/analysis-scope.ts";
import { loadAnalyseMeConfig, parseEnvFileContent } from "../src/config/load-config.ts";
import { resolveProjectKey } from "../src/config/project-key.ts";
import { AnalyseMeConfigError } from "../src/config/types.ts";
import { maskSecretPresence, maskSecretTail, redactSecrets } from "../src/utils/mask.ts";

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "analyseme-"));
}

async function removeTempDir(path) {
  await rm(path, { recursive: true, force: true });
}

async function writeEnvFile(cwd, content) {
  await writeFile(join(cwd, ".env"), content, "utf8");
}

async function writeSonarProjectProperties(cwd, content) {
  await writeFile(join(cwd, "sonar-project.properties"), content, "utf8");
}

async function writeGitConfig(cwd, content) {
  await mkdir(join(cwd, ".git"), { recursive: true });
  await writeFile(join(cwd, ".git", "config"), content, "utf8");
}

test("loads required config from environment variables and normalizes URL", async () => {
  const cwd = await createTempDir();

  try {
    const result = await loadAnalyseMeConfig({
      cwd,
      env: {
        SONARQUBE_URL: " https://sonar.example.com/// ",
        SONARQUBE_TOKEN: " local-token ",
      },
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.config?.url, "https://sonar.example.com");
    assert.equal(result.config?.token, "local-token");
    assert.equal(result.config?.tokenDisplay, "present");
    assert.equal(result.config?.sources.SONARQUBE_URL.source, "environment");
  } finally {
    await removeTempDir(cwd);
  }
});

test("loads local .env values and lets environment variables take precedence", async () => {
  const cwd = await createTempDir();

  try {
    await writeEnvFile(
      cwd,
      `SONARQUBE_URL=https://from-env-file.example.com/\nSONARQUBE_TOKEN=file-token\nSONARQUBE_ORGANIZATION=file-org\nSONARQUBE_PROJECT_KEY=file-project\n`,
    );

    const result = await loadAnalyseMeConfig({
      cwd,
      env: {
        SONARQUBE_TOKEN: "env-token",
        SONARQUBE_PROJECT_KEY: "env-project",
      },
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.envFile.exists, true);
    assert.equal(result.config?.url, "https://from-env-file.example.com");
    assert.equal(result.config?.token, "env-token");
    assert.equal(result.config?.organization, "file-org");
    assert.equal(result.config?.projectKey, "env-project");
    assert.equal(result.config?.sources.SONARQUBE_TOKEN.source, "environment");
    assert.equal(result.config?.sources.SONARQUBE_URL.source, "env-file");
  } finally {
    await removeTempDir(cwd);
  }
});

test("reports missing and invalid config without exposing token secrets", async () => {
  const cwd = await createTempDir();

  try {
    const missingUrl = await loadAnalyseMeConfig({
      cwd,
      env: {
        SONARQUBE_TOKEN: "super-secret-token",
      },
    });

    assert.equal(missingUrl.config, undefined);
    assert.match(missingUrl.errors.join("\n"), /Missing required SONARQUBE_URL/);
    assert.doesNotMatch(missingUrl.errors.join("\n"), /super-secret-token/);

    const invalidUrl = await loadAnalyseMeConfig({
      cwd,
      env: {
        SONARQUBE_URL: "ftp://sonar.example.com",
        SONARQUBE_TOKEN: "super-secret-token",
      },
    });

    assert.match(invalidUrl.errors.join("\n"), /Invalid SONARQUBE_URL/);
    assert.doesNotMatch(invalidUrl.errors.join("\n"), /super-secret-token/);
  } finally {
    await removeTempDir(cwd);
  }
});

test("parses .env quoting and inline comments", () => {
  const values = parseEnvFileContent(`\n# comment\nexport SONARQUBE_URL="https://sonar.example.com/"\nSONARQUBE_TOKEN='token value'\nSONARQUBE_PROJECT_KEY=project-key # comment\n`);

  assert.equal(values.SONARQUBE_URL, "https://sonar.example.com/");
  assert.equal(values.SONARQUBE_TOKEN, "token value");
  assert.equal(values.SONARQUBE_PROJECT_KEY, "project-key");
});

test("resolves project key from explicit argument, env config, and sonar-project.properties", async () => {
  const cwd = await createTempDir();

  try {
    await writeSonarProjectProperties(cwd, "sonar.projectKey=properties-project\n");
    await writeGitConfig(cwd, '[remote "origin"]\n\turl = git@github.com:owner/remote-project.git\n');

    const explicit = await resolveProjectKey({ cwd, explicitProjectKey: "argument-project", configuredProjectKey: "env-project" });
    const configured = await resolveProjectKey({ cwd, configuredProjectKey: "env-project" });
    const properties = await resolveProjectKey({ cwd });

    assert.equal(explicit.projectKey, "argument-project");
    assert.equal(explicit.source, "argument");
    assert.equal(configured.projectKey, "env-project");
    assert.equal(configured.source, "SONARQUBE_PROJECT_KEY");
    assert.equal(properties.projectKey, "properties-project");
    assert.equal(properties.source, "sonar-project.properties");
    assert.equal(properties.gitDiagnostics.remotes[0]?.repositoryNameSuggestion, "remote-project");
  } finally {
    await removeTempDir(cwd);
  }
});

test("does not use git remote names as automatic project keys", async () => {
  const cwd = await createTempDir();

  try {
    await writeGitConfig(cwd, '[remote "origin"]\n\turl = https://github.com/owner/not-a-sonar-key.git\n');

    const resolution = await resolveProjectKey({ cwd });

    assert.equal(resolution.projectKey, undefined);
    assert.equal(resolution.source, "missing");
    assert.equal(resolution.gitDiagnostics.remotes[0]?.repositoryNameSuggestion, "not-a-sonar-key");
  } finally {
    await removeTempDir(cwd);
  }
});

test("resolves analysis scope from explicit args, configured values, and GitHub Actions", async () => {
  const cwd = await createTempDir();

  try {
    const eventPath = join(cwd, "event.json");
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 42 } }), "utf8");

    const explicit = await resolveAnalysisScope({ explicitBranch: "feature/a", configuredPullRequest: "5" });
    const configured = await resolveAnalysisScope({ configuredPullRequest: "7" });
    const github = await resolveAnalysisScope({ env: { GITHUB_EVENT_PATH: eventPath } });

    assert.deepEqual(explicit.scope, { kind: "branch", branch: "feature/a" });
    assert.equal(explicit.source, "argument");
    assert.deepEqual(configured.scope, { kind: "pullRequest", pullRequest: "7" });
    assert.equal(configured.source, "SONARQUBE_PULL_REQUEST");
    assert.deepEqual(github.scope, { kind: "pullRequest", pullRequest: "42" });
    assert.equal(github.source, "github-actions");
  } finally {
    await removeTempDir(cwd);
  }
});

test("rejects mutually exclusive branch and pull request scope", async () => {
  await assert.rejects(
    resolveAnalysisScope({ explicitBranch: "main", explicitPullRequest: "1" }),
    AnalyseMeConfigError,
  );

  const cwd = await createTempDir();

  try {
    await writeEnvFile(
      cwd,
      "SONARQUBE_URL=https://sonar.example.com\nSONARQUBE_TOKEN=token\nSONARQUBE_BRANCH=main\nSONARQUBE_PULL_REQUEST=1\n",
    );

    const result = await loadAnalyseMeConfig({ cwd, env: {} });
    assert.equal(result.config, undefined);
    assert.match(result.errors.join("\n"), /mutually exclusive/);
  } finally {
    await removeTempDir(cwd);
  }
});

test("masks and redacts token values", () => {
  assert.equal(maskSecretPresence("abc123"), "present");
  assert.equal(maskSecretPresence(undefined), "not set");
  assert.equal(maskSecretTail("abc12345"), "present (…2345)");
  assert.equal(redactSecrets("token abc123", ["abc123"]), "token [redacted]");
});

test("removes sonar-project.properties during cleanup helper use", async () => {
  const cwd = await createTempDir();

  try {
    await writeSonarProjectProperties(cwd, "sonar.projectKey=temp\n");
    await unlink(join(cwd, "sonar-project.properties"));
    const resolution = await resolveProjectKey({ cwd });
    assert.equal(resolution.source, "missing");
  } finally {
    await removeTempDir(cwd);
  }
});
