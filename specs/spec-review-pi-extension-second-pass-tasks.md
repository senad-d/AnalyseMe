# Second-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-01
- Pass focus: maintainability, clean-code, logic edge cases, type-safety gaps, duplicated behavior, and important test gaps.
- Project reviewed: TypeScript Pi extension package `@senad-d/pi-analyseme`.
- Sensitive files: local `.env` was intentionally not read.

## Files or areas reviewed

- Public Pi surfaces: `src/extension.ts`, `src/commands/analyseme.ts`, `src/events/lifecycle.ts`, `src/tools/*.ts`.
- Runtime configuration and scope logic: `src/config/load-config.ts`, `src/config/project-key.ts`, `src/config/analysis-scope.ts`, `src/config/git-diagnostics.ts`, `src/config/types.ts`.
- Sonar API and mapping modules: `src/sonar/client.ts`, `src/sonar/endpoints.ts`, `src/sonar/project-mapping.ts`, `src/sonar/issue-mapping.ts`, `src/sonar/hotspot-mapping.ts`.
- Shared utilities and UI rendering: `src/tools/shared.ts`, `src/utils/mask.ts`, `src/utils/truncation.ts`, `src/ui/config-tui.ts`.
- Tests and project conventions: `test/*.test.mjs`, `scripts/*.mjs`, `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `docs/STRUCTURE.md`, `specs/spec-tasks.md`.
- First-pass spec reviewed for overlap avoidance: `specs/spec-review-pi-extension-first-pass-tasks.md`.

## Safe commands run and results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — passed, 58/58 tests.
- `npm run format:check` — passed for 64 files during review; re-run after spec creation passed for 67 files.
- `npm run check` — passed.
- `npm run check:pack` — passed; package dry-run contains 32 files and excludes forbidden local/spec/generated files.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run validate` — passed.
- `PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e . --no-session -p "/analyseme help"` — passed.

## Findings summary by severity and category

- Medium / Type Safety + Validation: public tool schemas and executors accept empty or whitespace-only required strings, especially `issueKey` and `hotspotKey`.
- Medium / Architecture + Clean Code: detail tools duplicate context resolution, endpoint option construction, source fallback, location rendering, and low-level field readers.
- Medium / Logic + Testing: list mappers silently create `unknown-issue` and `unknown-hotspot` rows for malformed payloads instead of surfacing a clear partial-data warning.
- Low / Documentation + Maintenance: several implementation-status comments/docs/tests still describe the repository as pending or planned even though runtime surfaces are registered and tested.

## Ordered unchecked tasks

- [x] Validate and normalize public tool string inputs at the boundary

#### Why

The TypeBox schemas in `src/tools/project-summary.ts`, `src/tools/list-issues.ts`, `src/tools/get-issue.ts`, `src/tools/list-security-hotspots.ts`, and `src/tools/get-security-hotspot.ts` use plain `Type.String()` for required and optional string fields. Direct executor tests and resumed sessions can pass empty or whitespace-only values. Required fields such as `issueKey` and `hotspotKey` then produce weak Sonar requests instead of immediate actionable validation errors.

#### How to resolve

- Add `minLength` and clear descriptions to required string schema fields where supported, especially `issueKey` and `hotspotKey`.
- Add runtime normalization helpers for tool executors so direct calls, resumed sessions, and `prepareArguments`-style compatibility paths cannot bypass validation.
- Normalize optional `projectKey`, `organization`, `branch`, and `pullRequest` consistently before resolving config or building endpoints.
- Add focused tests for empty and whitespace-only required keys, optional string trimming, and branch/pullRequest validation.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Empty or whitespace-only `issueKey` and `hotspotKey` fail before any Sonar request is built.
- Optional string inputs are trimmed or treated as missing consistently across all tools.
- Error messages are actionable and do not include secrets.
- Focused boundary-validation tests and full validation commands pass.

- [x] Centralize duplicated detail-tool context and rendering helpers

#### Why

`src/tools/get-issue.ts` and `src/tools/get-security-hotspot.ts` repeat optional project context resolution, branch/pull-request endpoint option construction, source fallback windows, link construction, location rendering, text-range rendering, and `asRecord`/`stringField`/`numberField` helpers. This duplication increases the chance that future fixes land in one detail tool but not the other.

#### How to resolve

- Move shared optional-project context resolution into `src/tools/shared.ts` or a focused helper module without changing behavior.
- Extract shared source-window option construction, location/text-range rendering, and small record-field helpers where doing so reduces duplication without creating broad abstractions.
- Keep issue-specific rule guidance and hotspot-specific security guidance separate.
- Add regression tests proving `analyseme_get_issue` and `analyseme_get_security_hotspot` still build the same endpoint options, links, warnings, and rendered location text after the refactor.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Shared detail-tool behavior has one implementation path for project/scope context, source fallback window calculation, and common location rendering.
- Issue-only and hotspot-only behavior remains independently readable and tested.
- Existing public output contracts remain unchanged except for separately documented bug fixes.
- Refactor-focused regression tests and full validation commands pass.

- [x] Surface malformed list payloads instead of silently rendering unknown findings

#### Why

`src/sonar/issue-mapping.ts` maps missing issue keys to `unknown-issue`, and `src/sonar/hotspot-mapping.ts` maps missing hotspot keys to `unknown-hotspot`. The list tools can therefore show invalid rows without telling the agent that Sonar returned malformed or unsupported payload data. That hides integration drift and makes follow-up detail calls unreliable.

#### How to resolve

- Add typed validation or guarded mapping for critical list fields in `mapIssueSearchResponse()` / `mapIssueSummary()` and `mapHotspotSearchResponse()` / `mapSecurityHotspotSummary()`.
- Decide whether invalid rows should be skipped with warnings or included with explicit `invalid` metadata; implement one consistent policy for issues and hotspots.
- Include partial-data warnings in list tool `content` and `details` when rows are skipped or downgraded.
- Add tests for missing keys, non-array issue/hotspot payloads, and partially malformed rows.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- List outputs do not silently present placeholder finding keys as if they were valid Sonar keys.
- Malformed Sonar payloads produce clear warnings and structured metadata for later debugging.
- Valid current payloads still map as before.
- Mapping/list-tool tests and full validation commands pass.

- [x] Refresh stale implementation-status docs, comments, and preparation tests

#### Why

The runtime implementation is now registered in `src/extension.ts`, but some repository text still says runtime commands/tools are pending or planned. Examples include the stale planned-TUI comment in `src/extension.ts` and `CONTRIBUTING.md` wording that says the repository is prepared for implementation with commands/tools intentionally pending. Stale guidance increases onboarding friction and can cause later workers to make incorrect review assumptions.

#### How to resolve

- Update `src/extension.ts` comments to reflect the currently registered command, tools, and lifecycle behavior.
- Update `CONTRIBUTING.md` and any preparation-oriented docs/tests that still claim runtime surfaces are pending, while preserving historical context in specs where appropriate.
- Keep README, SECURITY, CHANGELOG, and `docs/STRUCTURE.md` aligned with actual implemented behavior.
- Add or adjust documentation tests only if they currently encode stale implementation status.
- Run `npm run format:check`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Current user/developer documentation no longer describes implemented AnalyseMe tools or commands as pending.
- Historical planning specs remain clearly historical or are not used as current runtime guidance.
- No public behavior changes are bundled into the documentation cleanup.
- Formatting, lint, tests, and full validation commands pass.

## Blocked checks or areas not reviewed

- Local `.env` contents were not read.
- Optional live Sonar API behavior with multiple SonarQube/SonarCloud versions was not exercised because it requires credentials and external services.
- Performance profiling with very large real Sonar payloads was not run; related bounding/sanitization work is captured in the first-pass spec.
- No automatic formatting, lint fixes, dependency updates, or code changes were applied during this review.
