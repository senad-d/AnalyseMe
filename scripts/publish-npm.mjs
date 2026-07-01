#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { argv, execPath as nodeExecPath, stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(rootUrl);
const scriptPath = fileURLToPath(import.meta.url);
const packageJsonUrl = new URL("package.json", rootUrl);
const pkg = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
const semverPatternSource = String.raw`(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const semverPattern = new RegExp(`^${semverPatternSource}$`);
const releaseGitTagPattern = new RegExp(`^v${semverPatternSource}$`);
const npmPackageNamePattern = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const gitBranchDisallowedCharacters = new Set([" ", "~", "^", ":", "?", "*", "[", "\\"]);
const releaseCommitMessage = "chore(release): v%s";
const npmCliRelativePath = "../lib/node_modules/npm/bin/npm-cli.js";
const homebrewNpmCliRelativePath = "../../../../lib/node_modules/npm/bin/npm-cli.js";
const trustedGitExecutablePaths = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

export function isValidSemver(version) {
  return typeof version === "string" && semverPattern.test(version);
}

export function isValidNpmPackageName(packageName) {
  return typeof packageName === "string" && npmPackageNamePattern.test(packageName);
}

export function isReleaseGitTag(tag) {
  return typeof tag === "string" && releaseGitTagPattern.test(tag);
}

export function isSafeGitRefSegment(segment) {
  return segment.length > 0 && !segment.startsWith(".") && !segment.endsWith(".lock");
}

export function isSafeGitBranchName(branch) {
  if (typeof branch !== "string" || branch.length === 0 || branch.length > 250) {
    return false;
  }

  if (branch === "@" || branch.includes("@{") || branch.includes("..")) {
    return false;
  }

  if (branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".")) {
    return false;
  }

  if (hasUnsafeGitBranchCharacter(branch)) {
    return false;
  }

  return branch.split("/").every(isSafeGitRefSegment);
}

function hasUnsafeGitBranchCharacter(branch) {
  for (const character of branch) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined || codePoint <= 31 || codePoint === 127) {
      return true;
    }

    if (gitBranchDisallowedCharacters.has(character)) {
      return true;
    }
  }

  return false;
}

function requireValidSemver(version, message) {
  if (!isValidSemver(version)) {
    throw new Error(message);
  }
}

function requireValidNpmPackageName(packageName) {
  if (!isValidNpmPackageName(packageName)) {
    throw new Error("package.json name must be a valid npm package name before publishing.");
  }
}

function requireReleaseGitTag(gitTag) {
  if (!isReleaseGitTag(gitTag)) {
    throw new Error("Release git tag must have the validated shape v<semver> before use.");
  }
}

function requireSafeGitBranchName(branch) {
  if (!isSafeGitBranchName(branch)) {
    throw new Error(`Refusing to push unsafe git branch name: ${branch}`);
  }
}

export function buildNpmPackageSpec(packageName, version) {
  requireValidNpmPackageName(packageName);
  requireValidSemver(version, "Version must be validated before checking npm.");

  return `${packageName}@${version}`;
}

export function buildNpmPublishArguments(packageName) {
  requireValidNpmPackageName(packageName);

  if (packageName.startsWith("@")) {
    return ["publish", "--access", "public"];
  }

  return ["publish"];
}

export function buildGitTag(version) {
  requireValidSemver(version, "Enter a valid semver version, for example 0.1.1 or 1.0.0-beta.1.");

  return `v${version}`;
}

export function buildGitTagRef(gitTag) {
  requireReleaseGitTag(gitTag);

  return `refs/tags/${gitTag}`;
}

export function buildGitBranchRef(branch) {
  requireSafeGitBranchName(branch);

  return `refs/heads/${branch}`;
}

export function buildGitBranchPushRefSpec(branch) {
  const branchRef = buildGitBranchRef(branch);

  return `${branchRef}:${branchRef}`;
}

export function buildGitTagPushRefSpec(gitTag) {
  const tagRef = buildGitTagRef(gitTag);

  return `${tagRef}:${tagRef}`;
}

function validatePackageMetadata() {
  requireValidNpmPackageName(pkg.name);
  requireValidSemver(pkg.version, "package.json version must be valid semver before publishing.");
}

function resolveNpmCliPath() {
  const nodeBinDirectory = dirname(nodeExecPath);
  const candidatePaths = [
    resolve(nodeBinDirectory, npmCliRelativePath),
    resolve(nodeBinDirectory, homebrewNpmCliRelativePath),
  ];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to locate the npm CLI without PATH lookup. Run this script with npm or reinstall Node with npm.");
}

function resolveGitPath() {
  for (const candidatePath of trustedGitExecutablePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to locate a trusted git executable. Install git in /usr/bin, /opt/homebrew/bin, or /usr/local/bin.");
}

function exitWithCommandStatus(result) {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readGitPorcelainStatus() {
  return execFileSync(resolveGitPath(), ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readCurrentGitBranch() {
  const branch = execFileSync(resolveGitPath(), ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (branch) {
    requireSafeGitBranchName(branch);
  }

  return branch;
}

function ensureCleanGitTree() {
  const status = readGitPorcelainStatus();
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before publishing.");
  }
}

function gitTagExists(gitTag) {
  const tagRef = buildGitTagRef(gitTag);
  const result = spawnSync(resolveGitPath(), ["rev-parse", "--verify", tagRef], {
    cwd: root,
    stdio: "ignore",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status === 0;
}

function ensureNpmLogin() {
  const npmCliPath = resolveNpmCliPath();
  const result = spawnSync(nodeExecPath, [npmCliPath, "whoami"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error("npm login is required before publishing. Run `npm login`, then retry.");
  }

  console.log(`npm user: ${result.stdout.trim()}`);
}

function isNpmPackageVersionPublished(packageName, version) {
  const packageSpec = buildNpmPackageSpec(packageName, version);
  const npmCliPath = resolveNpmCliPath();
  const result = spawnSync(nodeExecPath, [npmCliPath, "view", packageSpec, "version"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.error) {
    throw result.error;
  }

  return result.status === 0 && result.stdout.trim().length > 0;
}

function runNpmValidate() {
  const npmCliPath = resolveNpmCliPath();
  console.log("\n$ npm run validate");
  const result = spawnSync(nodeExecPath, [npmCliPath, "run", "validate"], {
    cwd: root,
    stdio: "inherit",
  });

  exitWithCommandStatus(result);
}

function runNpmVersion(version) {
  requireValidSemver(version, "Version must be validated before running npm version.");

  const npmCliPath = resolveNpmCliPath();
  console.log(`\n$ npm version ${version} -m ${releaseCommitMessage}`);
  const result = spawnSync(nodeExecPath, [npmCliPath, "version", version, "-m", releaseCommitMessage], {
    cwd: root,
    stdio: "inherit",
  });

  exitWithCommandStatus(result);
}

function runNpmPublish(packageName) {
  const publishArguments = buildNpmPublishArguments(packageName);
  const npmCliPath = resolveNpmCliPath();
  console.log(`\n$ npm ${publishArguments.join(" ")}`);

  if (packageName.startsWith("@")) {
    const scopedResult = spawnSync(nodeExecPath, [npmCliPath, "publish", "--access", "public"], {
      cwd: root,
      stdio: "inherit",
    });
    exitWithCommandStatus(scopedResult);
    return;
  }

  const unscopedResult = spawnSync(nodeExecPath, [npmCliPath, "publish"], {
    cwd: root,
    stdio: "inherit",
  });
  exitWithCommandStatus(unscopedResult);
}

function pushGitBranch(branch) {
  const branchRefSpec = buildGitBranchPushRefSpec(branch);
  console.log(`\n$ git push origin ${branch}`);
  const result = spawnSync(resolveGitPath(), ["push", "origin", branchRefSpec], {
    cwd: root,
    stdio: "inherit",
  });

  exitWithCommandStatus(result);
}

function pushGitTag(gitTag) {
  const tagRefSpec = buildGitTagPushRefSpec(gitTag);
  console.log(`\n$ git push origin ${gitTag}`);
  const result = spawnSync(resolveGitPath(), ["push", "origin", tagRefSpec], {
    cwd: root,
    stdio: "inherit",
  });

  exitWithCommandStatus(result);
}

export async function main() {
  validatePackageMetadata();

  console.log(`Publishing ${pkg.name}`);
  console.log(`Current version: ${pkg.version}`);

  ensureCleanGitTree();
  ensureNpmLogin();

  const rl = createInterface({ input, output });
  const version = (await rl.question("Version to publish (for example 0.1.1): ")).trim();

  if (!isValidSemver(version)) {
    rl.close();
    throw new Error("Enter a valid semver version, for example 0.1.1 or 1.0.0-beta.1.");
  }

  if (version === pkg.version) {
    rl.close();
    throw new Error(`package.json is already at version ${version}. Choose a new version.`);
  }

  const gitTag = buildGitTag(version);
  if (gitTagExists(gitTag)) {
    rl.close();
    throw new Error(`Git tag ${gitTag} already exists.`);
  }

  if (isNpmPackageVersionPublished(pkg.name, version)) {
    rl.close();
    throw new Error(`${pkg.name}@${version} already exists on npm.`);
  }

  const publishArguments = buildNpmPublishArguments(pkg.name);

  console.log("\nThis will:");
  console.log(`- run npm validation`);
  console.log(`- run npm version ${version} to update package.json/package-lock.json`);
  console.log(`- create a release commit and git tag ${gitTag}`);
  console.log(`- run npm ${publishArguments.join(" ")}`);

  const confirm = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
  if (confirm !== "y" && confirm !== "yes") {
    rl.close();
    throw new Error("Publish cancelled.");
  }

  rl.close();

  runNpmValidate();
  runNpmVersion(version);
  runNpmPublish(pkg.name);

  const pushRl = createInterface({ input, output });
  const push = (await pushRl.question(`Push current branch and ${gitTag} to origin? [y/N] `)).trim().toLowerCase();
  pushRl.close();

  if (push === "y" || push === "yes") {
    const branch = readCurrentGitBranch();
    if (!branch) {
      throw new Error(`Release was published, but git is in detached HEAD. Push ${gitTag} manually.`);
    }

    pushGitBranch(branch);
    pushGitTag(gitTag);
  }

  console.log(`\nPublished ${pkg.name}@${version}.`);
}

function isCurrentEntrypoint() {
  if (!argv[1]) {
    return false;
  }

  return resolve(argv[1]) === scriptPath;
}

if (isCurrentEntrypoint()) {
  try {
    await main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
