import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGitBranchPushRefSpec,
  buildGitTag,
  buildGitTagPushRefSpec,
  buildGitTagRef,
  buildNpmPackageSpec,
  buildNpmPublishArguments,
  isReleaseGitTag,
  isSafeGitBranchName,
  isValidSemver,
} from "../scripts/publish-npm.mjs";

test("validates release semver before command argument construction", () => {
  assert.equal(isValidSemver("1.2.3"), true);
  assert.equal(isValidSemver("1.2.3-beta.1"), true);
  assert.equal(isValidSemver("1.2.3+build.7"), true);

  assert.equal(isValidSemver("1.2"), false);
  assert.equal(isValidSemver("01.2.3"), false);
  assert.equal(isValidSemver("1.2.3/evil"), false);
});

test("builds npm package specs only from validated package names and versions", () => {
  assert.equal(buildNpmPackageSpec("@senad-d/pi-analyseme", "1.2.3"), "@senad-d/pi-analyseme@1.2.3");
  assert.equal(buildNpmPackageSpec("plain-package", "1.2.3-beta.1"), "plain-package@1.2.3-beta.1");

  assert.throws(() => buildNpmPackageSpec("BadName", "1.2.3"), /valid npm package name/);
  assert.throws(() => buildNpmPackageSpec("../package", "1.2.3"), /valid npm package name/);
  assert.throws(() => buildNpmPackageSpec("plain-package", "1.2"), /Version must be validated/);
});

test("builds fixed npm publish arguments from validated package names", () => {
  assert.deepEqual(buildNpmPublishArguments("plain-package"), ["publish"]);
  assert.deepEqual(buildNpmPublishArguments("@senad-d/pi-analyseme"), ["publish", "--access", "public"]);

  assert.throws(() => buildNpmPublishArguments("@scope/"), /valid npm package name/);
});

test("builds release git tags and tag refspecs only from semver values", () => {
  assert.equal(buildGitTag("1.2.3"), "v1.2.3");
  assert.equal(isReleaseGitTag("v1.2.3-beta.1"), true);
  assert.equal(isReleaseGitTag("1.2.3"), false);
  assert.equal(buildGitTagRef("v1.2.3"), "refs/tags/v1.2.3");
  assert.equal(buildGitTagPushRefSpec("v1.2.3"), "refs/tags/v1.2.3:refs/tags/v1.2.3");

  assert.throws(() => buildGitTag("1.2"), /valid semver version/);
  assert.throws(() => buildGitTagRef("v1.2.3/evil"), /validated shape/);
});

test("validates git branch names before building push refspecs", () => {
  assert.equal(isSafeGitBranchName("main"), true);
  assert.equal(isSafeGitBranchName("feature/sonar-security"), true);
  assert.equal(buildGitBranchPushRefSpec("feature/sonar-security"), "refs/heads/feature/sonar-security:refs/heads/feature/sonar-security");

  assert.equal(isSafeGitBranchName("feature branch"), false);
  assert.equal(isSafeGitBranchName("feature:branch"), false);
  assert.equal(isSafeGitBranchName("feature/.."), false);
  assert.equal(isSafeGitBranchName("feature/.hidden"), false);
  assert.equal(isSafeGitBranchName("feature/name.lock"), false);
  assert.throws(() => buildGitBranchPushRefSpec("feature branch"), /unsafe git branch name/);
});
