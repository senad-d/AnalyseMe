# Final-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-01
- Pass focus: strict final verification, Pi-extension lifecycle behavior, public command/tool contracts, edge cases, failure states, and unresolved assumptions from earlier passes.
- Project reviewed: TypeScript Pi extension package `@senad-d/pi-analyseme`.
- Sensitive files: local `.env` was intentionally not read.

## Files or areas reviewed

- Pi extension entry and lifecycle: `src/extension.ts`, `src/events/lifecycle.ts`.
- Public tools and schemas: `src/tools/project-summary.ts`, `src/tools/list-issues.ts`, `src/tools/get-issue.ts`, `src/tools/list-security-hotspots.ts`, `src/tools/get-security-hotspot.ts`, `src/tools/shared.ts`.
- Public command and UI behavior: `src/commands/analyseme.ts`, `src/ui/config-tui.ts`, `specs/spec-configuration-tui-design-standard.md`.
- Configuration, project key, and analysis scope behavior: `src/config/load-config.ts`, `src/config/project-key.ts`, `src/config/analysis-scope.ts`, `src/config/git-diagnostics.ts`.
- Sonar client, endpoints, mapping, truncation, and masking: `src/sonar/*.ts`, `src/utils/*.ts`.
- Tests and validation docs: `test/*.test.mjs`, `docs/VALIDATION.md`, `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`.
- Earlier generated review specs: `specs/spec-review-pi-extension-first-pass-tasks.md`, `specs/spec-review-pi-extension-second-pass-tasks.md`.
- Pi extension documentation reference: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`.

## Previous claims or assumptions verified

- Verified: `src/extension.ts` default export registers five tools, `/analyseme`, and session status lifecycle handlers.
- Verified: public tools define TypeBox schemas, descriptions, `promptSnippet`, and prompt guidelines that name the specific tool.
- Verified: Sonar runtime calls use Node `fetch` through `src/sonar/client.ts`; no shell-based Sonar HTTP calls were found.
- Verified: default validation is offline/mocked; `npm run validate` passes without live Sonar credentials.
- Verified: package dry-run excludes `.env`, `.pi`, specs, caches, reports, coverage, build output, tarballs, and `node_modules`.
- Verified: `pi --no-extensions -e . --no-session -p "/analyseme help"` loads the extension and prints help without credentials.
- Verified with concern: `/analyseme` has a custom TUI path, but `src/ui/config-tui.ts` renders a simple status panel rather than the documented wide two-pane / narrow one-pane design, and `test/config-tui.test.mjs` currently asserts that `┬` and `▶` are absent.
- Verified with concern: issue and hotspot source fallback uses only top-level `line`, so payloads with `textRange.startLine` but no `line` will skip available source context.
- Blocked: optional live SonarQube/SonarCloud smoke tests and real API compatibility across Sonar versions were not run because they require credentials and external services.

## Commands run and results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — passed, 58/58 tests.
- `npm run format:check` — passed for 64 files during review; re-run after spec creation passed for 67 files.
- `npm run check` — passed.
- `npm run check:pack` — passed; package dry-run contains 32 files and excludes forbidden local/spec/generated files.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run validate` — passed.
- `PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e . --no-session -p "/analyseme help"` — passed.
- `git status --short` — clean before review spec creation.

## Findings summary by severity and category

- High / Pi Integration + UI: `/analyseme` does not implement the documented configuration TUI visual standard for wide and narrow modes.
- Medium / Core Behavior + Edge Case: detail tools skip source fallback when Sonar provides `textRange.startLine` without a top-level `line`.
- Medium / Error Handling + Configuration: `/analyseme` can fail hard on unreadable local diagnostic/config files instead of rendering a status panel with actionable warnings.
- Medium / Pi Validation + Testing: isolated Pi smoke coverage verifies `/analyseme help` only; it does not yet protect command/config UI behavior or public tool registration in a Pi runtime.

## Ordered unchecked tasks

- [ ] Rebuild the `/analyseme` configuration TUI to match the documented Pi design standard

#### Why

`specs/spec-configuration-tui-design-standard.md` requires wide screens to use a two-pane framed layout, narrow screens to use a one-pane framed layout, selection marker `▶ `, footer separator ` • `, right-aligned values, and line-width safety. `src/ui/config-tui.ts` currently renders one simple panel for all non-tiny widths, uses `✓`/`!` markers instead of the selection marker, has no pane focus/navigation model, and `test/config-tui.test.mjs` explicitly asserts that `┬` and `▶` are absent.

#### How to resolve

- Rework `ConfigTuiModel` and `ConfigTuiComponent` in `src/ui/config-tui.ts` to model categories, selected rows, focus state, footer text, and responsive wide/narrow/tiny modes from `specs/spec-configuration-tui-design-standard.md`.
- Use the Pi custom UI lifecycle correctly: render through `ctx.ui.custom()` only in `ctx.mode === "tui"`, handle close/navigation keys predictably, and avoid network calls or file writes.
- Update `test/config-tui.test.mjs` and `test/analyseme-command.test.mjs` to assert the required wide two-pane separator, `▶ ` selection marker, narrow one-pane behavior, tiny fallback, right-aligned values, footer separator, close-key behavior, and no token disclosure.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, and `npm run validate`.

#### Acceptance criteria

- Wide `/analyseme` rendering includes the documented two-pane frame and selection marker while keeping every line within terminal width.
- Narrow `/analyseme` rendering uses the documented one-pane layout and tiny mode remains a four-line borderless fallback.
- Tests no longer encode the simplified panel as the expected design and instead verify the documented standard.
- `/analyseme` remains read-only, performs no Sonar network calls, and never displays the raw token.
- Full validation commands pass.

- [ ] Use text-range start lines for issue and hotspot source fallback

#### Why

`src/tools/get-issue.ts` and `src/tools/get-security-hotspot.ts` attempt source fallback only when the detail payload has a top-level numeric `line`. Sonar detail payloads can provide the primary location through `textRange.startLine` instead. In that case AnalyseMe can render a location line from mapping logic but still skip source retrieval, reducing the usefulness of the “Where is the issue/hotspot?” section.

#### How to resolve

- Update source fallback in `readSourceShowFallback()` and `readHotspotSourcePayload()` to derive the source line from top-level `line` or `textRange.startLine`.
- Keep the current `line - 3` / `line + 3` window behavior, clamped at line 1.
- Add tests in `test/get-issue-tool.test.mjs` and `test/get-security-hotspot-tool.test.mjs` where the mocked Sonar payload omits `line` but includes `textRange.startLine`; verify `/api/sources/show` is requested and source context appears in output.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- Issue and hotspot detail tools fetch source context when Sonar provides only `textRange.startLine` for the primary location.
- Existing behavior for payloads with top-level `line` is unchanged.
- Missing component or missing all line data still produces the current clear warning.
- Focused source-fallback tests and full validation commands pass.

- [ ] Make `/analyseme` status rendering resilient to unreadable local config and diagnostic files

#### Why

The `/analyseme` command is intended to be a read-only setup/status surface that helps users fix configuration. `loadOptionalEnvFile()`, `readSonarProjectPropertiesKey()`, and `readGitDiagnostics()` currently rethrow non-ENOENT file read errors. If `.env` is unreadable, `.env` is accidentally a directory, or local diagnostic files cannot be read, `/analyseme` can fail instead of showing an actionable status panel.

#### How to resolve

- Adjust config/status loading so `/analyseme` captures non-secret file-read failures as warnings or setup issues without dumping file contents or token values.
- Keep tool execution strict enough to fail when required Sonar configuration cannot be loaded, but ensure the status command can render recovery guidance.
- Add tests that simulate `.env` or diagnostic paths that exist but cannot be parsed/read safely, using cross-platform fixtures such as a directory where a file is expected.
- Confirm that warning text is actionable and does not include raw `.env` contents or `SONARQUBE_TOKEN`.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run validate`.

#### Acceptance criteria

- `/analyseme` renders a status/helpful warning state instead of crashing when local config/diagnostic files are unreadable or malformed.
- Required tool calls still fail clearly when essential configuration is missing or unusable.
- Tests cover the degraded status behavior without relying on platform-specific file permissions.
- Full validation commands pass.

- [ ] Add isolated Pi runtime smoke coverage for registered public surfaces

#### Why

Unit tests use fake `pi` objects to verify registration and direct executor behavior, and one manual command verified `/analyseme help` through Pi. There is no automated or documented offline smoke that protects the full extension load path, `/analyseme` config command behavior, lifecycle status registration, and public tool availability in an isolated Pi runtime.

#### How to resolve

- Add a safe smoke script or documented CI/manual validation command that runs Pi with `--no-extensions -e . --no-session` and placeholder environment values, without live Sonar credentials or network-dependent tool calls.
- Cover `/analyseme help` and `/analyseme` config/status output in non-interactive mode, verifying no raw token is printed.
- Where Pi provides a stable command/tool discovery mechanism, assert the five `analyseme_*` tools and `/analyseme` command are registered; otherwise document the blocker and keep fake-API unit tests as the registration guard.
- Update `docs/VALIDATION.md` with the exact smoke command(s) and expected output.
- Run `npm run validate` plus the new smoke command.

#### Acceptance criteria

- An offline isolated Pi smoke path protects extension loading and command/config behavior without requiring live Sonar credentials.
- The smoke path either verifies public tool registration through Pi or documents the exact Pi limitation that prevents automated discovery.
- Smoke output checks prove placeholder/raw token values are not printed.
- Validation docs and CI/manual instructions are updated and independently reviewable.

## Unknowns resolved

- Resolved: default export, tool registration, command registration, lifecycle hooks, package contents, validation scripts, and `/analyseme help` isolated loading were directly inspected or executed.
- Resolved: the current config TUI is intentionally simpler than the documented design; this is now captured as a high-priority follow-up task.
- Resolved: default tests are offline and do not require live Sonar credentials.

## Blocked checks or areas not reviewed

- Live SonarQube/SonarCloud project summary, issue list/detail, and hotspot list/detail calls were not run because credentials and an explicit live target were not provided.
- Full interactive keyboard testing of `/analyseme` in a real terminal was not run; unit-level component rendering and one Pi help smoke were used instead.
- Compatibility across multiple SonarQube server versions was not verified against real APIs.
- No implementation, auto-fix, formatter write, dependency update, or generated-output change was performed during this review.
