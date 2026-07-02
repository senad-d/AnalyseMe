# First-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-02
- Pass focus: security vulnerabilities, runtime bugs, unsafe input handling, async failure modes, secret leakage risk, dependency and CI supply-chain risk.
- Project: `/Users/senad/Documents/Code/Moj_git/pi-analyseme`

## Files or areas reviewed

- Pi package and extension entry points: `package.json`, `src/extension.ts`, `src/constants.ts`.
- Public Pi surfaces: `src/tools/*.ts`, `src/commands/analyseme.ts`, `src/events/lifecycle.ts`, `src/ui/config-tui.ts`.
- Configuration and local-file handling: `src/config/load-config.ts`, `src/config/project-key.ts`, `src/config/analysis-scope.ts`, `src/config/git-diagnostics.ts`, `src/config/file-errors.ts`, `src/config/types.ts`.
- Sonar network boundary: `src/sonar/client.ts`, `src/sonar/endpoints.ts`, `src/sonar/issue-mapping.ts`, `src/sonar/hotspot-mapping.ts`, `src/sonar/project-mapping.ts`.
- Output safety helpers: `src/utils/mask.ts`, `src/utils/text-safety.ts`, `src/utils/truncation.ts`, `src/utils/abort.ts`.
- Validation, release, and CI support: `test/*.test.mjs`, `scripts/*.mjs`, `.github/workflows/ci.yml`, `.github/workflows/sonar.yml`, `.github/dependabot.yml`, `trivy_scan.sh` presence.
- Documentation and security model: `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `docs/VALIDATION.md`, `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-architecture.md`, `specs/spec-guidelines.md`, `specs/spec-configuration-tui-design-standard.md`.
- Avoided generated/state files: `.env`, `node_modules/`, `.git/`, `.pi/`, caches, reports, package tarballs.

## Safe commands run and results

- `git status --short --branch` — passed; repository was on `main...origin/main` before review specs were created.
- `git ls-files | sort` — passed; used to map tracked project files without reading ignored secret files.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — failed: 84/85 tests passed; `test/preparation.test.mjs` failed because `specs/spec-tasks.md` is missing.
- `npm run format:check` — failed: `.github/workflows/sonar.yml` does not end with a newline.
- `npm run check` — passed.
- `npm run check:pack` — passed; package dry-run contained 35 files and excluded local state/specs.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run smoke:pi` — passed; isolated Pi smoke verified `/analyseme help` and `/analyseme` status output.

## Findings summary by severity

- High: Sonar API reads have no response-size limit or request timeout, so a slow or oversized configured endpoint can hang or exhaust memory before truncation runs.
- High: Project-key resolution reads `.git/config` diagnostics before honoring explicit or configured project keys, so a non-essential unreadable Git diagnostics file can break otherwise valid tool calls.
- Medium: Secret redaction masks only the raw token string; derived forms such as Basic-auth credentials or encoded token echoes are not covered by tests.
- Medium: CI workflow dependencies in `.github/workflows/ci.yml` use moving action tags while the Sonar workflow pins actions by SHA.

## Ordered unchecked tasks

- [x] Add bounded Sonar HTTP reads and request timeouts

#### Why

`src/sonar/client.ts` calls `fetch()` with the Pi abort signal but no client-side timeout, then reads the full response body with `response.text()` before JSON parsing or error mapping. Tool output truncation happens only after the entire Sonar response has already been read, parsed, and mapped. A slow Sonar endpoint or a misconfigured/malicious endpoint can therefore hang the tool indefinitely or return an oversized body that consumes memory before `truncateAnalyseMeText()` can protect the agent context.

#### How to resolve

- Update `src/sonar/client.ts` to enforce a conservative per-request timeout while still respecting the incoming Pi `AbortSignal`.
- Add a bounded body reader for success and error responses before JSON parsing; reject responses whose body exceeds the configured limit with a `SonarApiError` that does not include secrets.
- Consider checking `Content-Length` early when present, but do not rely on it as the only guard.
- Add tests in `test/sonar-client.test.mjs` for oversized success bodies, oversized error bodies, slow/aborted requests, and preservation of caller abort behavior.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- Sonar API success and error bodies are bounded before full parsing or error rendering in `src/sonar/client.ts`.
- Slow requests fail with an actionable timeout error unless the caller abort signal fires first.
- Tests prove oversized bodies and timeout paths fail safely without exposing `SONARQUBE_TOKEN` or authorization header values.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Make Git diagnostics non-blocking after an explicit or configured project key is available

#### Why

`src/config/project-key.ts` calls `readGitDiagnostics()` before checking an explicit `projectKey` argument or configured `SONARQUBE_PROJECT_KEY`. Tool calls use this path without `tolerateFileReadErrors`, so an unreadable or malformed `.git/config` can fail `analyseme_*` tools even when the user provided a valid project key. Git diagnostics are documented as suggestions only and must not become a runtime prerequisite for read-only Sonar requests.

#### How to resolve

- Change `resolveProjectKey()` so explicit tool arguments and configured project keys are returned without depending on successful Git diagnostics.
- When Git diagnostics are still useful, make read failures warnings rather than hard failures for non-diagnostic flows.
- Add focused tests in `test/config.test.mjs` that simulate an unreadable `.git/config` and verify explicit/configured project-key resolution still succeeds.
- Verify `/analyseme` still surfaces diagnostic warnings when tolerant status rendering is requested.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- A valid explicit `projectKey` or `SONARQUBE_PROJECT_KEY` is sufficient for tool context resolution even if `.git/config` cannot be read.
- Git diagnostic warnings remain available for `/analyseme` status output without blocking Sonar tool execution.
- Regression tests cover explicit, configured, and missing project-key paths with Git diagnostics failures.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Broaden Sonar token redaction to cover derived credential echoes

#### Why

`src/utils/mask.ts` redacts exact token strings, and `src/sonar/client.ts` builds a Basic authorization header from `${token}:`. If an intermediary, proxy, or unexpected Sonar error echoes a Basic header, base64 credential, or encoded token form in an error body, current redaction tests do not prove that value is removed before it reaches thrown errors, tool warnings, or details.

#### How to resolve

- Extend the redaction helper used by `safeSonarWarningText()` to redact the raw token and predictable derived forms used by this client, including the Basic credential payload and Authorization header value.
- Add tests in `test/sonar-client.test.mjs` and/or `test/config.test.mjs` for raw token, Basic header, and encoded token echoes in fetch failures and HTTP error bodies.
- Review tool warning paths in `src/tools/get-issue.ts` and `src/tools/get-security-hotspot.ts` to ensure optional request warnings use the strengthened helper.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- Error and warning text redacts raw Sonar tokens and the derived credential forms produced by `createSonarAuthorizationHeader()`.
- Tests fail on the current narrow redaction and pass after the redaction helper is strengthened.
- No tool `content`, `details`, thrown error, or warning path can include the tested token variants.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Pin CI workflow actions by immutable commit SHA

#### Why

`.github/workflows/ci.yml` uses moving action references (`actions/checkout@v7` and `actions/setup-node@v6`) while `.github/workflows/sonar.yml` already pins third-party actions by commit SHA. Moving tags are convenient but create supply-chain drift: CI behavior can change without a repository diff, and a compromised or retagged action version would run in validation with repository access.

#### How to resolve

- Update `.github/workflows/ci.yml` to pin `actions/checkout` and `actions/setup-node` to reviewed commit SHAs, preserving comments that identify the human-readable version.
- Keep Dependabot configured for GitHub Actions updates so pinned SHAs can still be refreshed intentionally.
- Add a lightweight documentation note or reviewer checklist entry if the project wants all workflows to follow the same pinning policy.
- Validate with `npm run format:check` and, when possible in CI, a pull-request workflow run.

#### Acceptance criteria

- `.github/workflows/ci.yml` uses immutable SHA references for third-party actions.
- The workflow remains readable by including the intended action version in comments or nearby text.
- Dependabot action updates still have a clear path to update pinned SHAs.
- `npm run format:check` passes locally, and any CI validation blocker is documented with the exact next action.

## Blocked checks or areas not reviewed

- Live SonarQube/SonarCloud calls were not run because they require real credentials and network access; default tests use mocked `fetch`.
- `npm run validate` was not run as a separate aggregate command because `npm run test` already failed on the missing `specs/spec-tasks.md` prerequisite.
- `trivy_scan.sh` was identified but not executed because scanner runs can be slow, may require local Docker/tooling state, and are outside the default safe validation path.
- Ignored local files such as `.env`, `.pi/`, `.git/`, `node_modules/`, caches, and generated reports were not read.
