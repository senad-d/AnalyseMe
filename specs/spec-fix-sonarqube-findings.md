# Plan: Fix SonarQube Findings One by One

## Task Description
Sequential implementation spec for resolving the 41 active SonarQube/SonarCloud findings reported for project `senad-d_AnalyseMe`.

This spec is based on the issue list plus individual `analyseme_get_issue` reads for every finding key in the snapshot. Sonar source snippets were unavailable for these issues, so file paths, line numbers, flows, and rule guidance come from Sonar issue metadata.

## Objective
Resolve every active bug, vulnerability, and code smell from this Sonar snapshot while preserving existing AnalyseMe behavior, tests, and read-only Sonar tool guarantees.

## Problem Statement
Sonar currently reports:

- 2 bugs
- 5 vulnerabilities
- 34 code smells
- 0 security hotspots

Several findings are repeated instances of the same rule in contiguous code blocks. Fix them one by one from this checklist, but when adjacent findings require editing the same contiguous block, apply one coherent edit and only mark each issue task complete after its specific Sonar issue is resolved.

## Solution Approach

- Prioritize security and reliability findings first.
- Use the Sonar-provided rule guidance for each issue.
- Keep edits minimal and behavior-preserving.
- Avoid nesting functions in new code.
- Add or update tests when behavior can regress.
- Validate locally after each group of related tasks, then verify with Sonar after a new analysis run.

## Relevant Files

- `scripts/publish-npm.mjs` - argument injection, PATH-based command execution, and top-level await findings.
- `src/config/load-config.ts` - sort comparator, regex character class, and escaped-backslash string findings.
- `src/ui/config-tui.ts` - direct iterator callback and consecutive `lines.push(...)` findings.
- `src/utils/text-safety.ts` - ANSI escape regex literal, escaped-backslash, and regex complexity findings.
- `src/sonar/client.ts` - nested template literal finding.
- `dev-shims/pi-coding-agent/index.js` - intentionally empty shim method finding.
- `scripts/check-format.mjs` - trailing-whitespace regex backtracking finding.
- `src/tools/get-issue.ts` - consecutive `lines.push(...)` findings.
- `src/tools/get-security-hotspot.ts` - consecutive `lines.push(...)` findings.
- `test/*.test.mjs` - update relevant tests when behavior changes.
- `package.json` - validation command source.

## Implementation Phases

### Phase 1: Security and reliability fixes
Fix `scripts/publish-npm.mjs`, `src/config/load-config.ts`, and the direct iterator callback issue first.

### Phase 2: Regex and readability fixes
Fix regex complexity, escaped-backslash strings, nested template literal, empty method, and formatting regex findings.

### Phase 3: Consecutive push cleanup and validation
Consolidate repeated `lines.push(...)` sequences, run local validation, then verify the Sonar findings disappear after reanalysis.

## Step by Step Tasks
IMPORTANT: Execute every task in order. Keep each checkbox unchecked until that task is implemented and its acceptance criteria are met.

### 1. Fix `AZ8e3ZrOI62rm2YbscGD` - validate OS command input in `run`

- [x] In `scripts/publish-npm.mjs:25`, apply Sonar rule `jssecurity:S8705` by validating or eliminating untrusted data before it reaches `spawnSync(command, args)`.
- Prefer fixed command choices or a strict command allowlist before invoking an OS command.

#### Acceptance criteria

- `run(...)` cannot execute an unexpected command name.
- Existing publish workflow behavior remains unchanged for intended commands.
- Sonar issue `AZ8e3ZrOI62rm2YbscGD` is no longer reported after reanalysis.

### 2. Fix `AZ8e3ZrOI62rm2YbscGE` - validate OS command input in `commandSucceeds`

- [x] In `scripts/publish-npm.mjs:41`, apply Sonar rule `jssecurity:S8705` by validating or eliminating untrusted data before it reaches `spawnSync(command, args)`.
- Keep the `git rev-parse --verify refs/tags/...` check behavior intact.

#### Acceptance criteria

- `commandSucceeds(...)` cannot execute an unexpected command name.
- Tag-existence checks still return true/false as before.
- Sonar issue `AZ8e3ZrOI62rm2YbscGE` is no longer reported after reanalysis.

### 3. Fix `AZ8e3ZrOI62rm2YbscGC` - validate npm view arguments

- [x] In `scripts/publish-npm.mjs:95`, apply Sonar rule `jssecurity:S8705` before invoking `spawnSync` with `npm view` arguments.
- Ensure the package spec passed to `npm view` is built only from validated package name and semver version values.

#### Acceptance criteria

- The `npm view` command receives only validated arguments.
- Invalid package/version inputs fail before the OS command is called.
- Sonar issue `AZ8e3ZrOI62rm2YbscGC` is no longer reported after reanalysis.

### 4. Fix `AZ8e3ZrOI62rm2YbscF_` - avoid PATH resolution for npm login check

- [x] In `scripts/publish-npm.mjs:56`, apply Sonar rule `javascript:S4036` so the npm login check does not rely on unsafe PATH resolution.
- Use a fixed command path, a documented safe command resolution approach, or native API alternative consistent with Sonar guidance.

#### Acceptance criteria

- The login check no longer depends on an attacker-controlled PATH value.
- `ensureNpmLogin()` still detects logged-in and logged-out npm states.
- Sonar issue `AZ8e3ZrOI62rm2YbscF_` is no longer reported after reanalysis.

### 5. Fix `AZ8e3ZrOI62rm2YbscGA` - avoid PATH resolution for npm view

- [x] In `scripts/publish-npm.mjs:95`, apply Sonar rule `javascript:S4036` so the `npm view` check does not rely on unsafe PATH resolution.
- Keep the published-version check behavior intact.

#### Acceptance criteria

- The published-version check no longer depends on an attacker-controlled PATH value.
- Existing package-exists/package-missing behavior remains unchanged.
- Sonar issue `AZ8e3ZrOI62rm2YbscGA` is no longer reported after reanalysis.

### 6. Fix `AZ8e3ZrOI62rm2YbscGB` - use top-level await

- [x] In `scripts/publish-npm.mjs:146`, apply Sonar rule `javascript:S7785` by replacing the top-level `main().catch(...)` promise chain with top-level `await` and `try`/`catch`.
- Preserve the existing `fail(...)` error handling behavior.

#### Acceptance criteria

- `scripts/publish-npm.mjs` uses top-level `await` instead of a top-level promise chain.
- Errors still produce the same failure path.
- Sonar issue `AZ8e3ZrOI62rm2YbscGB` is no longer reported after reanalysis.

### 7. Fix `AZ8e3ZnPI62rm2YbscFd` - add locale-aware sort comparator

- [x] In `src/config/load-config.ts:158`, apply Sonar rule `typescript:S2871` by replacing `Object.keys(values).sort()` with an explicit compare function based on `String.localeCompare`.

#### Acceptance criteria

- Loaded env-file keys remain sorted deterministically.
- The sort operation uses an explicit comparator.
- Sonar issue `AZ8e3ZnPI62rm2YbscFd` is no longer reported after reanalysis.

### 8. Fix `AZ8e3Zq_I62rm2YbscFx` - wrap direct map callback

- [x] In `src/ui/config-tui.ts:237`, apply Sonar rule `typescript:S7727` by wrapping `actionSetting` in an arrow callback so `.map(...)` passes only intended arguments.

#### Acceptance criteria

- `issues.map(...)` calls `actionSetting` through an explicit callback.
- Config TUI action labels still include the correct index.
- Sonar issue `AZ8e3Zq_I62rm2YbscFx` is no longer reported after reanalysis.

### 9. Fix `AZ8e3ZrVI62rm2YbscGF` - document or implement empty invalidate method

- [x] In `dev-shims/pi-coding-agent/index.js:10`, apply Sonar rule `javascript:S1186` by adding implementation behavior or a nested comment explaining why `invalidate()` is intentionally empty.

#### Acceptance criteria

- `DynamicBorder.invalidate()` is no longer an unexplained empty method.
- Development shim behavior remains compatible with local typechecking and smoke tests.
- Sonar issue `AZ8e3ZrVI62rm2YbscGF` is no longer reported after reanalysis.

### 10. Fix `AZ8e3ZrHI62rm2YbscF-` - remove non-linear trailing-whitespace regex

- [x] In `scripts/check-format.mjs:52`, apply Sonar rule `javascript:S8786` by simplifying the trailing-whitespace check to avoid super-linear backtracking.
- Preserve the current ability to detect trailing spaces and tabs.

#### Acceptance criteria

- Trailing whitespace detection still works for spaces and tabs.
- The check no longer uses a regex pattern Sonar flags for non-linear backtracking.
- Sonar issue `AZ8e3ZrHI62rm2YbscF-` is no longer reported after reanalysis.

### 11. Fix `AZ8e3Zq2I62rm2YbscFw` - reduce ANSI regex complexity

- [x] In `src/utils/text-safety.ts:27`, apply Sonar rule `typescript:S5843` by simplifying the ANSI escape handling regex, splitting it into smaller patterns, or moving part of the validation into regular code as Sonar suggests.
- Preserve `sanitizeSonarText(...)` behavior for ANSI escape removal and control-character filtering.

#### Acceptance criteria

- No single regex in this area exceeds Sonar's complexity threshold.
- Existing text sanitization behavior remains covered by tests or focused checks.
- Sonar issue `AZ8e3Zq2I62rm2YbscFw` is no longer reported after reanalysis.

### 12. Fix `AZ8e3ZqvI62rm2YbscFt` - remove nested template literal

- [x] In `src/sonar/client.ts:87`, apply Sonar rule `typescript:S4624` by moving the nested `` `${token}:` `` template into a separate variable before building the authorization header.

#### Acceptance criteria

- `createSonarAuthorizationHeader(...)` does not contain nested template literals.
- Generated Basic authorization headers are unchanged.
- Sonar issue `AZ8e3ZqvI62rm2YbscFt` is no longer reported after reanalysis.

### 13. Fix `AZ8e3Zq2I62rm2YbscFu` - prefer regex literal

- [x] In `src/utils/text-safety.ts:26`, apply Sonar rule `typescript:S6325` by replacing the `RegExp` constructor with regex literal syntax where the pattern remains static.

#### Acceptance criteria

- Static regex construction no longer uses `new RegExp(...)`.
- ANSI escape sanitization behavior remains unchanged.
- Sonar issue `AZ8e3Zq2I62rm2YbscFu` is no longer reported after reanalysis.

### 14. Fix `AZ8e3Zq2I62rm2YbscFv` - avoid escaped backslash string in ANSI regex

- [x] In `src/utils/text-safety.ts:27`, apply Sonar rule `typescript:S7780` by removing escaped-backslash string literals or converting remaining static string patterns to `String.raw` template literals.

#### Acceptance criteria

- The ANSI escape pattern area no longer uses hard-to-read escaped-backslash string literals.
- Behavior remains unchanged for representative ANSI escape inputs.
- Sonar issue `AZ8e3Zq2I62rm2YbscFv` is no longer reported after reanalysis.

### 15. Fix `AZ8e3ZnPI62rm2YbscFe` - use concise regex character class

- [x] In `src/config/load-config.ts:270`, apply Sonar rule `typescript:S6353` by replacing `[A-Za-z0-9_]` with the concise `\w` equivalent where appropriate.
- Preserve the rule that env keys must still start with a letter or underscore.

#### Acceptance criteria

- Env key regex uses concise character class syntax for the trailing characters.
- Valid and invalid env key parsing behavior is unchanged.
- Sonar issue `AZ8e3ZnPI62rm2YbscFe` is no longer reported after reanalysis.

### 16. Fix `AZ8e3ZnPI62rm2YbscFf` - use `String.raw` for escaped newline pattern

- [x] In `src/config/load-config.ts:290`, apply Sonar rule `typescript:S7780` to the escaped `\n` source string in `decodeDoubleQuotedValue(...)`.

#### Acceptance criteria

- The `\n` source pattern is represented with `String.raw` or equivalent readable syntax accepted by Sonar.
- Decoding double-quoted env values still converts escaped newline sequences to newline characters.
- Sonar issue `AZ8e3ZnPI62rm2YbscFf` is no longer reported after reanalysis.

### 17. Fix `AZ8e3ZnPI62rm2YbscFg` - use `String.raw` for escaped carriage-return pattern

- [x] In `src/config/load-config.ts:291`, apply Sonar rule `typescript:S7780` to the escaped `\r` source string in `decodeDoubleQuotedValue(...)`.

#### Acceptance criteria

- The `\r` source pattern is represented with `String.raw` or equivalent readable syntax accepted by Sonar.
- Decoding double-quoted env values still converts escaped carriage-return sequences to carriage-return characters.
- Sonar issue `AZ8e3ZnPI62rm2YbscFg` is no longer reported after reanalysis.

### 18. Fix `AZ8e3ZnPI62rm2YbscFh` - use `String.raw` for escaped tab pattern

- [x] In `src/config/load-config.ts:292`, apply Sonar rule `typescript:S7780` to the escaped `\t` source string in `decodeDoubleQuotedValue(...)`.

#### Acceptance criteria

- The `\t` source pattern is represented with `String.raw` or equivalent readable syntax accepted by Sonar.
- Decoding double-quoted env values still converts escaped tab sequences to tab characters.
- Sonar issue `AZ8e3ZnPI62rm2YbscFh` is no longer reported after reanalysis.

### 19. Fix `AZ8e3ZnPI62rm2YbscFi` - use `String.raw` for escaped quote pattern

- [x] In `src/config/load-config.ts:293`, apply Sonar rule `typescript:S7780` to the escaped quote source string in `decodeDoubleQuotedValue(...)`.

#### Acceptance criteria

- The escaped quote source pattern is represented with `String.raw` or equivalent readable syntax accepted by Sonar.
- Decoding double-quoted env values still converts escaped quote sequences to quote characters.
- Sonar issue `AZ8e3ZnPI62rm2YbscFi` is no longer reported after reanalysis.

### 20. Fix `AZ8e3Zq_I62rm2YbscFy` - consolidate wide render push at line 373

- [x] In `src/ui/config-tui.ts:373`, apply Sonar rule `typescript:S7778` by combining consecutive `lines.push(...)` calls in `renderWide(...)` into a single call with multiple arguments.

#### Acceptance criteria

- The `renderWide(...)` line for `HELP_TEXT` participates in a single consolidated `lines.push(...)` call.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscFy` is no longer reported after reanalysis.

### 21. Fix `AZ8e3Zq_I62rm2YbscFz` - consolidate wide render push at line 374

- [x] In `src/ui/config-tui.ts:374`, include the `wideSeparator(..., "top")` push in the same consolidated `renderWide(...)` push sequence.

#### Acceptance criteria

- The top separator is added through the consolidated push call.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscFz` is no longer reported after reanalysis.

### 22. Fix `AZ8e3Zq_I62rm2YbscF0` - consolidate wide render push at line 375

- [x] In `src/ui/config-tui.ts:375`, include `...renderWideBodyRows(...)` in the same consolidated `renderWide(...)` push sequence.

#### Acceptance criteria

- Wide body rows are still appended in the same order.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF0` is no longer reported after reanalysis.

### 23. Fix `AZ8e3Zq_I62rm2YbscF1` - consolidate wide render push at line 376

- [x] In `src/ui/config-tui.ts:376`, include the bottom wide separator in the same consolidated `renderWide(...)` push sequence.

#### Acceptance criteria

- The bottom separator is still appended after body rows.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF1` is no longer reported after reanalysis.

### 24. Fix `AZ8e3Zq_I62rm2YbscF2` - consolidate wide render push at line 377

- [x] In `src/ui/config-tui.ts:377`, include the footer line in the same consolidated `renderWide(...)` push sequence.

#### Acceptance criteria

- The footer still appears before the bottom border.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF2` is no longer reported after reanalysis.

### 25. Fix `AZ8e3Zq_I62rm2YbscF3` - consolidate wide render push at line 378

- [x] In `src/ui/config-tui.ts:378`, include the bottom border in the same consolidated `renderWide(...)` push sequence.

#### Acceptance criteria

- The bottom border remains the final wide-render line before fitting.
- Wide config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF3` is no longer reported after reanalysis.

### 26. Fix `AZ8e3Zq_I62rm2YbscF4` - consolidate narrow render push at line 388

- [x] In `src/ui/config-tui.ts:388`, apply Sonar rule `typescript:S7778` by combining consecutive `lines.push(...)` calls in `renderNarrow(...)` into a single call with multiple arguments.

#### Acceptance criteria

- The `HELP_TEXT` line participates in a single consolidated `renderNarrow(...)` push call.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF4` is no longer reported after reanalysis.

### 27. Fix `AZ8e3Zq_I62rm2YbscF5` - consolidate narrow render push at line 389

- [x] In `src/ui/config-tui.ts:389`, include the first narrow separator in the same consolidated `renderNarrow(...)` push sequence.

#### Acceptance criteria

- The first narrow separator remains before rendered rows.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF5` is no longer reported after reanalysis.

### 28. Fix `AZ8e3Zq_I62rm2YbscF6` - consolidate narrow render push at line 390

- [x] In `src/ui/config-tui.ts:390`, include `...rows.map(...)` in the same consolidated `renderNarrow(...)` push sequence.

#### Acceptance criteria

- Narrow rows are still appended in the same order.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF6` is no longer reported after reanalysis.

### 29. Fix `AZ8e3Zq_I62rm2YbscF7` - consolidate narrow render push at line 391

- [x] In `src/ui/config-tui.ts:391`, include the second narrow separator in the same consolidated `renderNarrow(...)` push sequence.

#### Acceptance criteria

- The second narrow separator remains after rendered rows.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF7` is no longer reported after reanalysis.

### 30. Fix `AZ8e3Zq_I62rm2YbscF8` - consolidate narrow render push at line 392

- [x] In `src/ui/config-tui.ts:392`, include the footer line in the same consolidated `renderNarrow(...)` push sequence.

#### Acceptance criteria

- The footer still appears before the bottom border.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF8` is no longer reported after reanalysis.

### 31. Fix `AZ8e3Zq_I62rm2YbscF9` - consolidate narrow render push at line 393

- [x] In `src/ui/config-tui.ts:393`, include the bottom border in the same consolidated `renderNarrow(...)` push sequence.

#### Acceptance criteria

- The bottom border remains the final narrow-render line before fitting.
- Narrow config TUI output remains unchanged.
- Sonar issue `AZ8e3Zq_I62rm2YbscF9` is no longer reported after reanalysis.

### 32. Fix `AZ8e3ZqoI62rm2YbscFo` - consolidate issue detail push at line 325

- [x] In `src/tools/get-issue.ts:325`, apply Sonar rule `typescript:S7778` by combining consecutive `lines.push(...)` calls in `renderIssueDetail(...)` into a single call with multiple arguments.

#### Acceptance criteria

- `renderSourceSnippets(issue)` is appended through a consolidated push sequence.
- `analyseme_get_issue` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqoI62rm2YbscFo` is no longer reported after reanalysis.

### 33. Fix `AZ8e3ZqoI62rm2YbscFp` - consolidate issue detail push at line 326

- [x] In `src/tools/get-issue.ts:326`, include `...renderSecondaryLocations(issue)` in the consolidated `renderIssueDetail(...)` push sequence.

#### Acceptance criteria

- Secondary locations are still rendered in the same order.
- `analyseme_get_issue` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqoI62rm2YbscFp` is no longer reported after reanalysis.

### 34. Fix `AZ8e3ZqoI62rm2YbscFq` - consolidate issue detail push at line 327

- [x] In `src/tools/get-issue.ts:327`, include `...renderFlows(issue)` in the consolidated `renderIssueDetail(...)` push sequence.

#### Acceptance criteria

- Flows are still rendered after secondary locations.
- `analyseme_get_issue` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqoI62rm2YbscFq` is no longer reported after reanalysis.

### 35. Fix `AZ8e3ZqoI62rm2YbscFr` - consolidate issue detail push at line 328

- [x] In `src/tools/get-issue.ts:328`, include the `## Sonar-provided rule guidance` heading in the consolidated `renderIssueDetail(...)` push sequence.

#### Acceptance criteria

- The rule guidance heading still appears before guidance content.
- `analyseme_get_issue` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqoI62rm2YbscFr` is no longer reported after reanalysis.

### 36. Fix `AZ8e3ZqoI62rm2YbscFs` - consolidate issue detail push at line 329

- [x] In `src/tools/get-issue.ts:329`, include the guidance content line in the consolidated `renderIssueDetail(...)` push sequence.

#### Acceptance criteria

- Sonar-provided guidance text still appears after the guidance heading.
- `analyseme_get_issue` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqoI62rm2YbscFs` is no longer reported after reanalysis.

### 37. Fix `AZ8e3ZqgI62rm2YbscFj` - consolidate hotspot detail push at line 245

- [x] In `src/tools/get-security-hotspot.ts:245`, apply Sonar rule `typescript:S7778` by combining consecutive `lines.push(...)` calls in `renderSecurityHotspotDetail(...)` into a single call with multiple arguments.

#### Acceptance criteria

- `renderSourceSnippets(hotspot)` is appended through a consolidated push sequence.
- `analyseme_get_security_hotspot` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqgI62rm2YbscFj` is no longer reported after reanalysis.

### 38. Fix `AZ8e3ZqgI62rm2YbscFk` - consolidate hotspot detail push at line 246

- [x] In `src/tools/get-security-hotspot.ts:246`, include `...renderSecondaryLocations(hotspot)` in the consolidated `renderSecurityHotspotDetail(...)` push sequence.

#### Acceptance criteria

- Secondary hotspot locations are still rendered in the same order.
- `analyseme_get_security_hotspot` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqgI62rm2YbscFk` is no longer reported after reanalysis.

### 39. Fix `AZ8e3ZqgI62rm2YbscFl` - consolidate hotspot detail push at line 247

- [x] In `src/tools/get-security-hotspot.ts:247`, include `...renderFlows(hotspot)` in the consolidated `renderSecurityHotspotDetail(...)` push sequence.

#### Acceptance criteria

- Hotspot flows are still rendered after secondary locations.
- `analyseme_get_security_hotspot` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqgI62rm2YbscFl` is no longer reported after reanalysis.

### 40. Fix `AZ8e3ZqgI62rm2YbscFm` - consolidate hotspot detail push at line 248

- [x] In `src/tools/get-security-hotspot.ts:248`, include the `## Sonar-provided security guidance` heading in the consolidated `renderSecurityHotspotDetail(...)` push sequence.

#### Acceptance criteria

- The security guidance heading still appears before guidance content.
- `analyseme_get_security_hotspot` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqgI62rm2YbscFm` is no longer reported after reanalysis.

### 41. Fix `AZ8e3ZqgI62rm2YbscFn` - consolidate hotspot detail push at line 249

- [x] In `src/tools/get-security-hotspot.ts:249`, include `...renderSecurityGuidance(hotspot)` in the consolidated `renderSecurityHotspotDetail(...)` push sequence.

#### Acceptance criteria

- Sonar-provided security guidance still appears after the security guidance heading.
- `analyseme_get_security_hotspot` markdown output remains unchanged.
- Sonar issue `AZ8e3ZqgI62rm2YbscFn` is no longer reported after reanalysis.

## Testing Strategy

- Run focused tests for touched areas after each related group:
  - Config parsing and env decoding: `node --test test/config.test.mjs`
  - Config TUI rendering: `node --test test/config-tui.test.mjs`
  - Issue detail output: `node --test test/get-issue-tool.test.mjs`
  - Security hotspot detail output: `node --test test/get-security-hotspot-tool.test.mjs`
  - Sonar client auth header behavior: `node --test test/sonar-client.test.mjs`
- Run full project validation before requesting Sonar reanalysis.
- After Sonar reanalysis, run `analyseme_list_issues` and confirm none of the issue keys in this spec remain active.

## Acceptance Criteria

- All 41 checklist tasks are completed and marked `[x]` only after their criteria are met.
- `npm run validate` passes.
- `npm run format:check` passes.
- Sonar reanalysis no longer reports the 41 issue keys listed in this spec.
- No secrets are introduced into logs, tests, docs, or issue output.
- Existing AnalyseMe read-only behavior is preserved.

## Validation Commands
Execute these commands to validate the task is complete:

- `npm run typecheck` - TypeScript validation.
- `npm run lint` - ESLint validation.
- `npm run test` - Unit and behavior tests.
- `npm run format:check` - Repository formatting check.
- `npm run validate` - Project validation bundle.
- `npm run check:pack` - Package contents validation.

## Notes

- Some adjacent findings share a root edit. For example, multiple `typescript:S7778` findings in the same function should be resolved with one consolidated `lines.push(...)` call, then each related task can be checked off after validation.
- For Sonar security findings, keep remediation aligned with Sonar-provided guidance: validate untrusted values before OS command use and avoid unsafe PATH resolution.
- If Sonar remains unhappy after a local behavior-preserving fix, use `analyseme_get_issue` for the remaining issue key before changing the approach.
