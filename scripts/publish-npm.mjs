#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { execPath, stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(rootUrl);
const packageJsonUrl = new URL("package.json", rootUrl);
const pkg = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const npmPackageNamePattern = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const npmCliRelativePath = "../lib/node_modules/npm/bin/npm-cli.js";
const homebrewNpmCliRelativePath = "../../../../lib/node_modules/npm/bin/npm-cli.js";

function capture(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function resolveRunCommand(command) {
  switch (command) {
    case "git":
      return "git";
    case "npm":
      return "npm";
    default:
      fail(`Unsupported publish command: ${command}`);
  }
}

function run(command, args) {
  const safeCommand = resolveRunCommand(command);
  console.log(`\n$ ${safeCommand} ${args.join(" ")}`);
  const result = spawnSync(safeCommand, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function buildNpmPackageSpec(packageName, version) {
  if (typeof packageName !== "string" || !npmPackageNamePattern.test(packageName)) {
    fail("package.json name must be a valid npm package name before checking npm.");
  }

  if (!semverPattern.test(version)) {
    fail("Version must be validated before checking npm.");
  }

  return `${packageName}@${version}`;
}

function commandSucceeds(command, args) {
  if (command !== "git") {
    fail(`Unsupported status command: ${command}`);
  }

  const result = spawnSync("git", args, {
    cwd: root,
    stdio: "ignore",
  });
  return result.status === 0;
}

function resolveNpmCliPath() {
  const nodeBinDirectory = dirname(execPath);
  const candidatePaths = [
    resolve(nodeBinDirectory, npmCliRelativePath),
    resolve(nodeBinDirectory, homebrewNpmCliRelativePath),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  fail("Unable to locate the npm CLI without PATH lookup. Run this script with npm or reinstall Node with npm.");
}

function spawnNpmCli(args, options) {
  return spawnSync(execPath, [resolveNpmCliPath(), ...args], options);
}

function ensureCleanGitTree() {
  const status = capture("git", ["status", "--porcelain"]);
  if (status) {
    fail("Working tree is not clean. Commit or stash changes before publishing.");
  }
}

function ensureNpmLogin() {
  const result = spawnNpmCli(["whoami"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    fail("npm login is required before publishing. Run `npm login`, then retry.");
  }

  console.log(`npm user: ${result.stdout.trim()}`);
}

async function main() {
  console.log(`Publishing ${pkg.name}`);
  console.log(`Current version: ${pkg.version}`);

  ensureCleanGitTree();
  ensureNpmLogin();

  const rl = createInterface({ input, output });
  const version = (await rl.question("Version to publish (for example 0.1.1): ")).trim();

  if (!semverPattern.test(version)) {
    rl.close();
    fail("Enter a valid semver version, for example 0.1.1 or 1.0.0-beta.1.");
  }

  if (version === pkg.version) {
    rl.close();
    fail(`package.json is already at version ${version}. Choose a new version.`);
  }

  const gitTag = `v${version}`;
  if (commandSucceeds("git", ["rev-parse", "--verify", `refs/tags/${gitTag}`])) {
    rl.close();
    fail(`Git tag ${gitTag} already exists.`);
  }

  const packageSpec = buildNpmPackageSpec(pkg.name, version);
  const publishedVersion = spawnNpmCli(["view", packageSpec, "version"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (publishedVersion.status === 0 && publishedVersion.stdout.trim()) {
    rl.close();
    fail(`${pkg.name}@${version} already exists on npm.`);
  }

  const publishArgs = ["publish"];
  if (pkg.name.startsWith("@")) {
    publishArgs.push("--access", "public");
  }

  console.log("\nThis will:");
  console.log(`- run npm validation`);
  console.log(`- run npm version ${version} to update package.json/package-lock.json`);
  console.log(`- create a release commit and git tag ${gitTag}`);
  console.log(`- run npm ${publishArgs.join(" ")}`);

  const confirm = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
  if (confirm !== "y" && confirm !== "yes") {
    rl.close();
    fail("Publish cancelled.");
  }

  rl.close();

  run("npm", ["run", "validate"]);
  run("npm", ["version", version, "-m", "chore(release): v%s"]);
  run("npm", publishArgs);

  const pushRl = createInterface({ input, output });
  const push = (await pushRl.question(`Push current branch and ${gitTag} to origin? [y/N] `)).trim().toLowerCase();
  pushRl.close();

  if (push === "y" || push === "yes") {
    const branch = capture("git", ["branch", "--show-current"]);
    if (!branch) {
      fail(`Release was published, but git is in detached HEAD. Push ${gitTag} manually.`);
    }

    run("git", ["push", "origin", branch]);
    run("git", ["push", "origin", gitTag]);
  }

  console.log(`\nPublished ${pkg.name}@${version}.`);
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
