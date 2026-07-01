# First-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-01
- Pass focus: security, runtime bugs, high-risk correctness, unsafe input handling, abort behavior, dependency risk, and secret/data leakage risk.
- Project reviewed: TypeScript Pi extension package `@senad-d/pi-analyseme` in `/Users/senad/Documents/Code/Moj_git/pi-analyseme`.
- Sensitive files: local `.env` was intentionally not read.

## Files or areas reviewed

- Package, build, lint, test, and packaging setup: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`, `.github/workflows/ci.yml`, `.github/dependabot.yml`.
- Pi extension entry and lifecycle: `src/extension.ts`, `src/events/lifecycle.ts`.
- Public command and TUI status surface: `src/commands/analyseme.ts`, `src/ui/config-tui.ts`.
- Configuration and project/scope resolution: `src/config/load-config.ts`, `src/config/project-key.ts`, `src/config/analysis-scope.ts`, `src/config/git-diagnostics.ts`, `src/config/types.ts`.
- Sonar client and endpoint construction: `src/sonar/client.ts`, `src/sonar/endpoints.ts`.
- Sonar response mapping and output safety: `src/sonar/project-mapping.ts`, `src/sonar/issue-mapping.ts`, `src/sonar/hotspot-mapping.ts`, `src/utils/mask.ts`, `src/utils/truncation.ts`.
- Public tool implementations: `src/tools/project-summary.ts`, `src/tools/list-issues.ts`, `src/tools/get-issue.ts`, `src/tools/list-security-hotspots.ts`, `src/tools/get-security-hotspot.ts`, `src/tools/shared.ts`.
- Tests and documentation relevant to security claims: `test/*.test.mjs`, `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `docs/VALIDATION.md`, `specs/spec-architecture.md`, `specs/spec-guidelines.md`, `specs/spec-tasks.md`.

## Safe commands run and results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — passed, 58/58 tests.
- `npm run format:check` — passed for 64 files during review; re-run after spec creation passed for 67 files.
- `npm run check` — passed.
- `npm run check:pack` — passed; dry-run package contains 32 files and excludes `.env`, `.pi`, specs, caches, reports, coverage, build output, tarballs, and `node_modules`.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run validate` — passed.
- `PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e . --no-session -p "/analyseme help"` — passed; printed help without credentials or network-dependent output.
- `git status --short` — clean before review spec creation.

## Findings summary by severity

- High: Sonar request path normalization can be bypassed with protocol-relative paths; optional rule/source fetches can swallow cancellation and continue work after abort.
- Medium: Detail tools do not verify returned issue/hotspot keys; Sonar-derived strings and details need stronger bounding/sanitization; HTTP Sonar URLs can send tokens without TLS by default.
- Low: No dependency vulnerabilities were reported by `npm audit`; no shell-based Sonar calls or Sonar mutation endpoints were found in runtime code.

## Ordered unchecked tasks

- [x] Reject protocol-relative and externally rooted Sonar API request paths

#### Why

`src/sonar/client.ts` rejects absolute `http://` and `https://` request paths, but `normalizeRequestPath()` currently accepts protocol-relative values such as `//evil.example.com/api/issues/search`. `new URL("//evil.example.com/...", "https://sonar.example.com/")` resolves to the external host, which would attach the Sonar Basic auth token if any future caller passes a non-constant path.

#### How to resolve

- Update `src/sonar/client.ts` so `normalizeRequestPath()` rejects protocol-relative paths, paths that URL parsing treats as host-changing, and any other externally rooted request path before `fetchSonarResponse()` can attach authorization.
- Keep endpoint builders in `src/sonar/endpoints.ts` relative to the configured Sonar base URL.
- Add tests in `test/sonar-client.test.mjs` for `//evil.example.com/...`, whitespace-padded protocol-relative paths, and the existing absolute URL rejection.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- `buildSonarApiUrl()` cannot produce a URL whose origin differs from the normalized configured Sonar origin for any accepted relative path.
- Protocol-relative and absolute request paths throw `SonarApiError` before any fetch or authorization header creation is possible.
- The new client tests and full validation commands pass.

- [x] Preserve AbortSignal cancellation in optional Sonar detail fetches

#### Why

`src/tools/get-issue.ts` catches all failures from rule metadata and source-context calls in `readRulePayload()`, `readSourceIssueSnippets()`, and `readSourceShowFallback()`. `src/tools/get-security-hotspot.ts` does the same in `readHotspotSourcePayload()`. If the Pi abort signal is triggered during these optional calls, the tools can convert cancellation into warnings and continue additional fetch attempts, leaving long-running work alive after the user cancels.

#### How to resolve

- Add a shared helper or local checks that detect abort/cancellation errors and rethrow them instead of turning them into optional-data warnings.
- Check `signal?.aborted` before starting fallback source requests after a failed optional request.
- Ensure optional non-abort Sonar failures still produce redacted warnings as they do today.
- Add focused tests in `test/get-issue-tool.test.mjs` and `test/get-security-hotspot-tool.test.mjs` that simulate abort during rule/source fetches and verify no fallback request runs after cancellation.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Aborted optional rule/source/hotspot source requests fail the tool execution as cancellation instead of returning a successful warning-only result.
- No additional source fallback request is attempted once the signal is aborted.
- Existing optional-source failure behavior remains warning-based for non-abort Sonar/API errors.
- Focused abort tests and full validation commands pass.

- [x] Verify detail responses match the requested issue and hotspot keys

#### Why

`src/tools/get-issue.ts` returns the first item in `response.issues` without confirming it matches the requested `issueKey`. `src/tools/get-security-hotspot.ts` accepts any hotspot payload with a `key`, even when it differs from `hotspotKey`. A malformed, stale, proxied, or unexpected Sonar response could make AnalyseMe show and persist details for the wrong finding.

#### How to resolve

- Update `extractSingleIssuePayload()` in `src/tools/get-issue.ts` to find the exact requested key and throw an actionable error if Sonar returns no matching issue.
- Update `extractHotspotPayload()` in `src/tools/get-security-hotspot.ts` to require the returned hotspot key to equal the requested hotspot key.
- Add tests for wrong-key issue and hotspot responses in the existing detail-tool test files.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Detail tools never return a finding whose returned key differs from the requested key.
- Wrong-key responses produce clear errors that do not expose secrets.
- Existing found/not-found behavior remains covered by tests.
- Focused detail-tool tests and full validation commands pass.

- [x] Bound and sanitize Sonar-derived strings before rendering or storing tool details

#### Why

Sonar issue messages, source snippets, rule guidance, hotspot guidance, and error text are external project data. Tool content is truncated with `truncateAnalyseMeText()`, but `details.issue`, `details.hotspot`, and list/detail arrays can still hold unbounded Sonar-derived strings. Those strings can bloat Pi session data and may contain terminal control sequences that should not be rendered or stored unsanitized.

#### How to resolve

- Add central text-safety helpers for Sonar-derived strings that strip terminal control sequences and apply per-field size limits suitable for `content` and `details`.
- Use those helpers in `src/sonar/issue-mapping.ts`, `src/sonar/hotspot-mapping.ts`, `src/sonar/project-mapping.ts`, and warning construction in the tool files.
- Preserve visible truncation notices and structured truncation metadata when mapped fields are shortened.
- Add tests with long guidance/source snippets and ANSI/control characters to verify content and details are bounded and sanitized.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Tool `content` and `details` no longer contain raw terminal control sequences from Sonar responses.
- Large Sonar-derived strings are bounded in both rendered output and structured details, with metadata or warnings identifying truncation.
- Secret redaction behavior from `src/utils/mask.ts` remains intact.
- New text-safety tests and full validation commands pass.

- [x] Require an explicit policy for sending Sonar tokens over non-TLS HTTP

#### Why

`normalizeSonarUrl()` in `src/config/load-config.ts` accepts both `http:` and `https:`. That may support local/self-hosted Sonar instances, but it also means AnalyseMe can send the Sonar token using Basic auth over cleartext HTTP without an explicit warning or opt-in. This is a credential-exposure risk.

#### How to resolve

- Decide the intended product policy for `http:` Sonar URLs: reject by default with an override, allow only localhost/private development endpoints, or allow with prominent warnings.
- Implement the chosen policy in config validation and `/analyseme` status output without printing token values.
- Update `README.md`, `SECURITY.md`, and tests in `test/config.test.mjs` / `test/analyseme-command.test.mjs` to document and verify the policy.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Users cannot accidentally send a Sonar token over non-TLS HTTP without either being blocked or seeing an explicit documented warning/opt-in path.
- `/analyseme` surfaces the insecure-URL state without exposing the token.
- Config and command tests cover HTTPS, HTTP, and the chosen override/warning behavior.
- Full validation commands pass.

## Blocked checks or areas not reviewed

- Local `.env` contents were not read, by design.
- Optional live SonarQube/SonarCloud smoke tests were not run because they require real credentials and network access.
- Interactive full-screen `/analyseme` TUI behavior was not manually exercised; unit tests and a non-interactive Pi help smoke were run instead.
- `trivy_scan.sh` was inspected only as a repository file name, not executed, because external scanner setup and generated reports are outside safe default review scope.
