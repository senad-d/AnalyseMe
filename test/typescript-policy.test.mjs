import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

// Revisit alongside the Dependabot ignore when typescript-eslint supports newer compilers.
const supportedCompiler = "6.0.3";

test("the manifest pins TypeScript exactly to the supported compiler", () => {
  assert.equal(packageJson.devDependencies.typescript, supportedCompiler);
});

test("the lockfile requests and resolves the same supported TypeScript pin", () => {
  assert.equal(packageLock.packages[""].devDependencies.typescript, supportedCompiler);
  assert.equal(packageLock.packages["node_modules/typescript"].version, supportedCompiler);
});
