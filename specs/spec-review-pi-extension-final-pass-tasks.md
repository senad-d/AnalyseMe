# Final-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-02
- Pass focus: strict verification of core Pi extension behavior, lifecycle, public tool/command contracts, edge cases, previous review claims, and remaining unknowns.
- Project: `/Users/senad/Documents/Code/Moj_git/pi-analyseme`

## Files or areas reviewed

- Earlier generated review specs: `specs/spec-review-pi-extension-first-pass-tasks.md`, `specs/spec-review-pi-extension-second-pass-tasks.md`.
- Pi manifest and entry point: `package.json`, `src/extension.ts`.
- Public Pi surfaces: `src/tools/project-summary.ts`, `src/tools/list-issues.ts`, `src/tools/get-issue.ts`, `src/tools/list-security-hotspots.ts`, `src/tools/get-security-hotspot.ts`, `src/commands/analyseme.ts`, `src/events/lifecycle.ts`, `src/ui/config-tui.ts`.
- Core integration logic: `src/config/*.ts`, `src/sonar/*.ts`, `src/utils/*.ts`.
- Validation and smoke coverage: `test/*.test.mjs`, `scripts/pi-smoke.mjs`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`, `docs/VALIDATION.md`.
- Pi documentation consulted: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`, `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`, `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`.

## Previous claims or assumptions verified

- Verified: `package.json` declares the package as a Pi package and points `pi.extensions` at `./src/extension.ts`.
- Verified: `src/extension.ts` has a small default factory and delegates registration to five tool modules, the `/analyseme` command module, and lifecycle hooks.
- Verified: the five public tools have TypeBox schemas, labels, descriptions, prompt snippets, and prompt guidelines that name the specific tool.
- Verified: runtime Sonar endpoint builders only cover read-style endpoints for quality gate, measures, issue search/detail, rule show, source show/snippets, hotspot search, and hotspot show.
- Verified: runtime HTTP uses Node `fetch` and does not shell out to `curl` or other API clients.
- Verified: `/analyseme` has JSON/print/TUI paths and avoids live Sonar network calls during local status rendering.
- Verified: lifecycle hooks only set and clear a UI status and do not start background jobs.
- Verified: default unit tests exercise many tool success/failure paths with mocked `fetch`, but the aggregate suite currently fails on the missing `specs/spec-tasks.md` file.
- Partially verified: isolated Pi smoke loads the extension and checks `/analyseme help` and `/analyseme`, but it does not machine-check the actual registered tool registry.
- Blocked: live SonarQube/SonarCloud API shape compatibility was not verified without credentials and a server matrix.

## Safe commands run and results

- `git ls-files | sort` — passed; used to map tracked project files.
- `rg -n "TODO|FIXME|HACK|XXX|spec-tasks|validate|smoke|custom\(|registerTool|registerCommand|session_start|session_shutdown|setStatus|ctx\.mode|ctx\.hasUI" src test docs README.md SECURITY.md package.json specs` — passed; used to inspect public-surface references, validation gaps, and stale task-spec references.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — failed: 84/85 tests passed; `test/preparation.test.mjs` failed because `specs/spec-tasks.md` is missing.
- `npm run format:check` — failed: `.github/workflows/sonar.yml` does not end with a newline.
- `npm run check` — passed.
- `npm run check:pack` — passed; package dry-run contained 35 files and excluded local state/specs.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run smoke:pi` — passed; isolated Pi smoke verified `/analyseme help` and `/analyseme` status output.

## Findings summary by severity and category

- High / Testing: The current validation baseline is not green; see the second-pass task for restoring `specs/spec-tasks.md` or removing stale references.
- Medium / Pi integration: Current smoke coverage confirms commands load, but a real Pi/API-level contract test does not assert that all five `analyseme_*` tools are registered and callable through the Pi tool registry.
- Medium / TUI conformance: The `/analyseme` custom component returns plain strings and does not consume the Pi theme callback, while the project TUI design standard and Pi TUI docs require semantic theme roles and clear focus styling.
- Medium / API compatibility: Mocked tests cover selected Sonar payload shapes, but there is no documented fixture matrix for important SonarQube/SonarCloud version differences in rule guidance, source snippets, and hotspot details.
- Low / Error contract coverage: Tool tests cover many success and optional-failure paths, but missing-configuration and auth/network failure behavior is not asserted uniformly for every public tool result contract.

## Ordered unchecked tasks

- [x] Add a Pi-level public surface contract test for command and tool registration

#### Why

Current unit tests use fake `registerTool`/`registerCommand` objects, and `scripts/pi-smoke.mjs` verifies `/analyseme help` plus `/analyseme` status output. This is useful but still leaves a core Pi-extension assumption only partially verified: the installed package should load through Pi and expose all five `analyseme_*` tools with their runtime schemas and guidance. A manifest, loader, API-shape, or registration regression could pass fake unit tests while breaking the actual Pi public surface.

#### How to resolve

- Investigate the current Pi SDK or CLI-supported way to inspect loaded extension tools without needing live Sonar credentials.
- If a stable machine-readable Pi registry API exists, add a smoke or integration test that loads `pi.extensions` from `package.json` and asserts `/analyseme` plus all five `ANALYSEME_TOOL_NAMES` are registered with expected schema fields and prompt guidance.
- If Pi still lacks a stable registry inspection path, create a narrow local extension harness that uses the real exported factory from `src/extension.ts` and a typed fake `ExtensionAPI` close to Pi's public interface, then document the remaining gap in `docs/VALIDATION.md`.
- Ensure the test remains offline and does not require Sonar credentials.
- Validate with `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run smoke:pi`.

#### Acceptance criteria

- A regression in `package.json` `pi.extensions`, `src/extension.ts`, or any public tool registration causes an automated test or smoke check to fail.
- The test verifies the command name and all five public tool names from `ANALYSEME_TOOL_NAMES` without contacting Sonar.
- Any remaining limitation in Pi tool-registry discovery is documented in `docs/VALIDATION.md` with the exact follow-up needed.
- `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run smoke:pi` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Align the `/analyseme` TUI implementation with Pi theme and focus conventions

#### Why

`src/ui/config-tui.ts` implements the configured wide/narrow/tiny layouts and line-width clipping, but `ConfigTuiComponent` returns plain strings and the command ignores the `theme` and `keybindings` values passed by `ctx.ui.custom()`. The project design standard calls for semantic theme roles, selected-row focus styling, and consistent selection markers, while Pi TUI documentation recommends using the callback theme and key helpers for custom components. Without a focused conformance pass, future UI changes can look inconsistent across themes or regress keyboard/focus behavior.

#### How to resolve

- Review `specs/spec-configuration-tui-design-standard.md` against the current intentionally read-only `/analyseme` behavior and explicitly decide which generic editable-template elements are adapted or omitted.
- Update `ConfigTuiComponent` and `renderConfigTui()` to accept and apply Pi theme roles where the design standard requires them, or document why the status panel intentionally remains unstyled plain text.
- Use Pi key helpers from `@earendil-works/pi-tui` where practical instead of only raw escape-sequence comparisons, while preserving existing `q`, escape, and arrow behavior.
- Add tests in `test/config-tui.test.mjs` for focus styling/markers, theme-aware rendering where testable, read-only deviations, and line-width safety across wide/narrow/tiny widths.
- Validate with `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run smoke:pi`.

#### Acceptance criteria

- `/analyseme` TUI behavior is either fully aligned with the design standard's theme/focus rules or has documented, deliberate read-only deviations.
- Tests cover the selected category/setting visual contract, keyboard close/navigation behavior, and width constraints.
- The implementation uses Pi TUI conventions for theme and key handling where applicable.
- `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run smoke:pi` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Add cross-tool error contract tests for missing config and Sonar failures

#### Why

The tool tests cover many mocked success paths, optional source/rule failures, truncation, and abort behavior. They do not uniformly assert each public tool's behavior when required configuration is missing, when Sonar returns 401/403/5xx, or when a network failure occurs. Since Pi marks a custom tool as failed only when `execute()` throws, these error contracts should be consistent, actionable, and secret-safe across all five tools.

#### How to resolve

- Add focused tests for `analyseme_get_project_summary`, `analyseme_list_issues`, `analyseme_get_issue`, `analyseme_list_security_hotspots`, and `analyseme_get_security_hotspot` that cover missing `SONARQUBE_URL`, missing `SONARQUBE_TOKEN`, Sonar auth errors, malformed JSON, and network failures where applicable.
- Assert errors are thrown, messages are actionable, and raw tokens or derived credential strings are not present.
- Keep tests offline with mocked `fetch` and isolated temporary directories.
- Coordinate with the first-pass client hardening task so timeout/body-limit errors are included once implemented.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- Every public tool has tests proving missing-config and representative Sonar failure paths throw safe, actionable errors.
- Token values and tested derived credential forms are absent from all thrown messages and warning strings.
- The tests document any intentional difference between list, detail, and summary tool failure behavior.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Build a documented Sonar API compatibility fixture matrix

#### Why

AnalyseMe maps SonarQube/SonarCloud payloads for issue details, rule guidance, source snippets, security hotspot details, flows, and secondary locations. Current tests use representative mocked payloads, but they do not document which SonarQube/SonarCloud versions or payload variants are known to be supported. This leaves core behavior vulnerable to silent data loss when APIs return alternate field names, absent arrays, HTML/Markdown guidance variants, or product-specific hotspot structures.

#### How to resolve

- Collect sanitized, non-secret fixture payloads for the important read-only endpoints listed in `src/sonar/endpoints.ts` across the SonarQube/SonarCloud versions the project intends to support.
- Store fixtures under `test/fixtures/` or another documented test-only location; ensure no private source, project identifiers, or tokens are included.
- Expand mapper and tool tests to run against the fixture matrix for rule guidance, source snippets fallback, hotspot guidance, flows, secondary locations, pagination, and missing-field behavior.
- Document fixture provenance and any unsupported API variants in `docs/VALIDATION.md` or a dedicated compatibility note.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- A test fixture matrix exists for the Sonar endpoint payload shapes AnalyseMe claims to support.
- Mapper/tool tests exercise the fixtures and fail if important guidance, source context, flows, or pagination fields stop mapping.
- Fixture documentation explains supported versions or products and lists any known unsupported variants.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

## Unknowns resolved

- Resolved: the extension does not start background work from the factory or lifecycle hooks.
- Resolved: package dry-run excludes specs, local state, environment files, caches, generated reports, and `node_modules/`.
- Resolved: default validation is not currently green because of the missing `specs/spec-tasks.md` test fixture.
- Resolved: `format:check` is an available script but not enforced by `validate`, and it currently fails on a newline issue.
- Partially resolved: Pi load smoke passes for `/analyseme` command behavior, but public tool registry verification remains a targeted follow-up task.

## Blocked checks or areas not reviewed

- Live Sonar smoke testing was not run because it requires credentials and an explicitly chosen Sonar project.
- A full `npm run validate` aggregate command was not run because `npm run test` is already known to fail; running the aggregate would repeat that blocker.
- No destructive commands, automatic fixes, format writers, dependency updates, generated file updates, or runtime implementation changes were performed.
- Ignored local secret/state paths such as `.env`, `.git/`, `.pi/`, `node_modules/`, caches, and reports were not read.
