# Plan: SonarQube Security Remediation

## Task Description
Create a focused remediation checklist for the current active SonarQube/SonarCloud security findings in project `senad-d_AnalyseMe`.

This snapshot was collected with `analyseme_get_project_summary`, `analyseme_list_issues`, `analyseme_get_issue` for each vulnerability, and `analyseme_list_security_hotspots`. Sonar source snippets were unavailable, so issue keys, locations, flows, and rule guidance come from Sonar metadata plus local source inspection.

## Objective
Resolve all currently active Sonar security vulnerabilities while preserving the existing publish workflow and CI validation behavior.

## Problem Statement
Sonar currently reports a failing quality gate with:

- Security rating: `3.0`
- Vulnerabilities: `6`
- Security hotspots requiring review: `0`

Current active security issues:

| Issue key | Rule | Impact | Location | Summary |
| --- | --- | --- | --- | --- |
| `AZ8frxC8K0SfOljMFiq1` | `jssecurity:S8705` | SECURITY:HIGH | `scripts/publish-npm.mjs:46` | Validate untrusted data before passing it to OS commands. |
| `AZ8frxC8K0SfOljMFiq0` | `javascript:S4036` | SECURITY:LOW | `scripts/publish-npm.mjs:73` | Avoid OS command execution that relies on unsafe `PATH` resolution. |
| `AZ8frxC8K0SfOljMFiq2` | `jssecurity:S8705` | SECURITY:HIGH | `scripts/publish-npm.mjs:73` | Validate untrusted data before passing it to OS commands. |
| `AZ8frxC8K0SfOljMFiq3` | `jssecurity:S8705` | SECURITY:HIGH | `scripts/publish-npm.mjs:97` | Validate untrusted data before passing it to OS commands. |
| `AZ8frxEoK0SfOljMFiq4` | `githubactions:S6505` | SECURITY:MEDIUM | `.github/workflows/ci.yml:33` | Install JavaScript dependencies without running lifecycle scripts. |
| `AZ8frxEoK0SfOljMFiq5` | `githubactions:S8543` | SECURITY:MEDIUM | `.github/workflows/ci.yml:33` | Install JavaScript dependencies from a required lock file. |

## Solution Approach

- Use Sonar guidance for OS command issues: avoid generic command wrappers where possible, validate user-controlled values before they become arguments, and do not rely on attacker-controlled `PATH` lookup.
- Refactor `scripts/publish-npm.mjs` toward dedicated operation-specific helpers instead of broad `run(command, args)`, `commandSucceeds(command, args)`, and unconstrained `spawnNpmCli(args, options)` calls.
- Keep npm operations tied to `process.execPath` plus the already-resolved npm CLI file, but validate the permitted npm subcommands and user-derived arguments before spawning.
- Replace git command execution by name with a fixed trusted executable resolution strategy or an equivalent native implementation that does not use `PATH` lookup.
- Update CI dependency installation from `npm install` to an explicit lock-file and no-lifecycle-script install command.
- Keep tasks small and sequential; mark each checkbox only after its acceptance criteria pass.

## Relevant Files

- `scripts/publish-npm.mjs` - publish workflow, npm/git command execution, version/tag/package argument handling.
- `.github/workflows/ci.yml` - CI dependency installation command flagged by GitHub Actions rules.
- `package-lock.json` - required lock file for `npm ci`.
- `package.json` - validation scripts and package metadata used by the publish script.
- `test/*.test.mjs` - add focused regression coverage if helper behavior is testable without publishing.

### New Files

- Add a focused test file only if command validation helpers can be exported or tested safely without invoking real publish commands.

## Implementation Phases

### Phase 1: Publish script command hardening
Refactor command execution in `scripts/publish-npm.mjs` to remove generic wrappers, validate arguments, and avoid unsafe executable lookup.

### Phase 2: CI dependency installation hardening
Update GitHub Actions install behavior to require `package-lock.json` and suppress third-party lifecycle scripts during install.

### Phase 3: Regression coverage and Sonar verification
Run local validation, add focused tests if practical, and verify the six Sonar issues disappear after a new analysis.

## Step by Step Tasks
IMPORTANT: Execute every task in order, top to bottom. Keep each checkbox unchecked until the task is implemented and its acceptance criteria are met.

### 1. Replace generic npm `run(...)` execution in `scripts/publish-npm.mjs`

- [x] Remove or narrow the generic `run(command, args)` path currently reaching `spawnSync(safeCommand, args)` at `scripts/publish-npm.mjs:46`.
- [x] Introduce dedicated helpers for the publish workflow operations that currently call `run("npm", ...)`: validate, version, and publish.
- [x] Ensure the `npm version` helper accepts only a semver value that has already passed `semverPattern` validation before it is used as a command argument.
- [x] Ensure the publish helper builds only fixed argument lists: `publish` or `publish --access public` based on a validated package name.

#### Acceptance criteria

- No broad helper can pass arbitrary command names or arbitrary argument arrays into `spawnSync` for npm operations.
- `npm run validate`, `npm version <validated-version> -m chore(release): v%s`, and `npm publish` behavior remains intact.
- Invalid version or package name input fails before spawning npm.
- Sonar issue `AZ8frxC8K0SfOljMFiq1` is no longer reported after reanalysis.

### 2. Validate npm CLI arguments passed through `spawnNpmCli(...)`

- [x] Replace the unconstrained `spawnNpmCli(args, options)` API at `scripts/publish-npm.mjs:97` with operation-specific helpers such as npm login check and published-version lookup.
- [x] Keep the npm CLI path resolution based on `process.execPath` plus known npm CLI file locations, not `PATH` lookup.
- [x] For `npm view`, construct the package spec only through `buildNpmPackageSpec(pkg.name, version)` after package-name and semver validation.
- [x] Permit only the expected npm subcommands and fixed argument shapes needed by this script.

#### Acceptance criteria

- The npm login check still detects logged-in and logged-out states.
- The published-version lookup still detects an already-published package version.
- No user-controlled or LLM-controlled argument array can reach `spawnSync(execPath, [npmCliPath, ...args], ...)` without strict validation.
- Sonar issue `AZ8frxC8K0SfOljMFiq3` is no longer reported after reanalysis.

### 3. Replace generic git status/tag execution and remove unsafe `PATH` resolution

- [x] Replace `commandSucceeds(command, args)` with a git-specific helper for the tag-existence check used before publishing.
- [x] Validate the derived git tag with the existing semver-derived `v<version>` shape before passing it to any git command.
- [x] Replace `spawnSync("git", ...)` and any remaining git command execution by name with a fixed trusted git executable strategy, or a native alternative, so command execution does not depend on attacker-controlled `PATH` lookup.
- [x] Review `capture("git", ...)` and git push calls in the same file so the publish script has one consistent, safe git execution boundary.

#### Acceptance criteria

- Git tag existence checks still return true or false as before.
- Clean-tree checks, current-branch detection, and optional push behavior remain intact.
- Git execution no longer relies on resolving `git` from an uncontrolled `PATH`.
- User-derived tag or branch values are validated before being used as git arguments.
- Sonar issues `AZ8frxC8K0SfOljMFiq0` and `AZ8frxC8K0SfOljMFiq2` are no longer reported after reanalysis.

### 4. Harden CI dependency installation

- [x] In `.github/workflows/ci.yml:33`, replace `npm install` with `npm ci --ignore-scripts`.
- [x] Keep `actions/setup-node` cache set to npm and ensure `package-lock.json` remains committed.
- [x] Confirm `npm run validate` still runs project validation scripts after dependencies are installed.

#### Acceptance criteria

- CI installs from the committed `package-lock.json` instead of resolving dependency ranges.
- CI dependency installation does not run third-party lifecycle scripts.
- The validation job still installs dependencies and runs `npm run validate` successfully.
- Sonar issues `AZ8frxEoK0SfOljMFiq4` and `AZ8frxEoK0SfOljMFiq5` are no longer reported after reanalysis.

### 5. Add focused regression coverage if command boundaries are testable

- [x] Prefer extracting pure validation/building helpers only if it can be done without nesting functions or making the publish script harder to follow.
- [x] Add tests for accepted and rejected semver values, npm package specs, git tags, and any command argument builders introduced by the refactor.
- [x] Avoid tests that run real `npm publish`, `npm version`, `git push`, or network-dependent commands.

#### Acceptance criteria

- New tests cover command argument validation and fixed argument construction where practical.
- Tests do not publish packages, mutate git history, push refs, or require npm network access.
- Existing tests continue to pass.

### 6. Validate locally and verify in Sonar

- [x] Run the local validation commands listed below.
- [ ] Trigger a new SonarCloud/SonarQube analysis using the existing `sonar-project.properties` configuration.
- [ ] Re-check active issues and confirm the vulnerability count drops from `6` to `0` for this snapshot.

#### Acceptance criteria

- `npm run validate` completes successfully.
- A new Sonar analysis reports no active issues for keys `AZ8frxC8K0SfOljMFiq1`, `AZ8frxC8K0SfOljMFiq0`, `AZ8frxC8K0SfOljMFiq2`, `AZ8frxC8K0SfOljMFiq3`, `AZ8frxEoK0SfOljMFiq4`, and `AZ8frxEoK0SfOljMFiq5`.
- Quality gate no longer fails because of these security vulnerabilities.

## Testing Strategy

- Use fast local checks first: syntax, lint, tests, packaging checks, then full validation.
- Test pure validation helpers where possible rather than spawning real external commands.
- Manually review the publish script to ensure every OS command boundary has fixed command selection and validated arguments.
- Verify the GitHub Actions install command is exactly aligned with npm lock-file and lifecycle-script guidance.

## Acceptance Criteria

- All six current Sonar vulnerabilities are addressed.
- No security hotspots require review.
- Existing publish workflow behavior is preserved for valid inputs.
- CI uses `npm ci --ignore-scripts` with the committed `package-lock.json`.
- `npm run validate` passes.
- A new Sonar analysis no longer reports the listed issue keys.

## Validation Commands
Execute these commands to validate the task is complete:

- `node --check scripts/publish-npm.mjs` - Verify the publish script parses successfully.
- `npm run lint` - Run ESLint across JavaScript and TypeScript sources.
- `npm test` - Run the Node test suite.
- `npm run validate` - Run the full project validation pipeline.
- `git diff --check` - Detect whitespace errors before committing.
- `sonar-scanner` - Re-run Sonar analysis from `sonar-project.properties` when `SONAR_TOKEN` and scanner tooling are available.

## Notes

- Sonar reported no security hotspots requiring review in this snapshot.
- Avoid nesting functions when adding helpers.
- Keep each task independently reviewable and mark `[x]` only after the task-specific acceptance criteria pass.
