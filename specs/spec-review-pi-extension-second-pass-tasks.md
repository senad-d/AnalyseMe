# Second-pass Pi extension review tasks

## Review scope and date

- Date: 2026-07-02
- Pass focus: maintainability, clean-code, logic defects, loose or duplicated behavior, validation gaps, and repository best practices.
- Project: `/Users/senad/Documents/Code/Moj_git/pi-analyseme`

## Files or areas reviewed

- Repository conventions and validation: `package.json`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`, `.github/workflows/ci.yml`, `.github/workflows/sonar.yml`, `.github/PULL_REQUEST_TEMPLATE.md`.
- Test coverage and failing tests: `test/preparation.test.mjs`, `test/config.test.mjs`, `test/sonar-client.test.mjs`, `test/sonar-mapping.test.mjs`, tool tests, command/TUI tests, lifecycle tests.
- Documentation/spec consistency: `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `docs/VALIDATION.md`, `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-architecture.md`, `specs/spec-guidelines.md`, `specs/spec-configuration-tui-design-standard.md`.
- Logic-heavy runtime modules: `src/config/*.ts`, `src/sonar/*.ts`, `src/tools/*.ts`, `src/ui/config-tui.ts`, `src/utils/*.ts`.
- Existing first-pass review output: `specs/spec-review-pi-extension-first-pass-tasks.md` was created before this pass and was treated as planning evidence, not as an implementation source.

## Safe commands run and results

- `git ls-files | sort` — passed; used to map tracked files and avoid ignored local state.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — failed: 84/85 tests passed; `test/preparation.test.mjs` failed because `specs/spec-tasks.md` is missing.
- `npm run format:check` — failed: `.github/workflows/sonar.yml` does not end with a newline.
- `npm run check` — passed.
- `npm run check:pack` — passed; package dry-run contained 35 files and excluded local state/specs.
- `npm audit --audit-level=moderate` — passed; found 0 vulnerabilities.
- `npm run smoke:pi` — passed; isolated Pi smoke verified `/analyseme help` and `/analyseme` status output.

## Findings summary by severity and category

- High / Testing: The default test suite is red because `test/preparation.test.mjs`, `README.md`, `SECURITY.md`, and `specs/spec-guidelines.md` still reference `specs/spec-tasks.md`, but that file is absent from the repository.
- Medium / Build hygiene: `format:check` is available but not part of `npm run validate` or CI, and it currently fails on `.github/workflows/sonar.yml`.
- Medium / Logic: Issue and hotspot mappers derive displayed file paths by splitting Sonar component keys at the first colon, which can be wrong for valid Sonar project keys that themselves contain colons.
- Low / Maintainability: Repeated issue/hotspot location parsing and rendering helpers increase the chance of future behavior drift across normal issue and security hotspot tools.

## Ordered unchecked tasks

- [x] Restore the missing implementation task spec or remove stale references consistently

#### Why

`npm run test` currently fails because `test/preparation.test.mjs` reads `specs/spec-tasks.md`, but only `specs/spec-architecture.md`, `specs/spec-configuration-tui-design-standard.md`, and `specs/spec-guidelines.md` exist. The missing file is also linked from `README.md`, referenced in `SECURITY.md`, and described as normative in `specs/spec-guidelines.md`. This breaks default validation and leaves contributors with inconsistent planning instructions.

#### How to resolve

- Decide whether `specs/spec-tasks.md` should be restored as the canonical implementation backlog or whether the repository has intentionally moved to another task-spec structure.
- If restoring it, create `specs/spec-tasks.md` with unchecked tasks that follow the repository task format and include concrete acceptance criteria.
- If retiring it, update `test/preparation.test.mjs`, `README.md`, `SECURITY.md`, and `specs/spec-guidelines.md` to reference the replacement specs accurately.
- Validate that documentation links and preparation tests agree with the chosen task-spec convention.
- Run `npm run test` and `npm run validate` after the fix.

#### Acceptance criteria

- The repository either contains a valid `specs/spec-tasks.md` or no tracked test/doc file references it as a required file.
- Any restored or replacement task spec uses unchecked `- [ ]` tasks and includes acceptance criteria for each task.
- `npm run test` passes the preparation-spec check.
- `npm run validate` passes or the remaining blocker is documented with the exact failing command and next action.

- [x] Make formatting validation enforceable in the default validation path

#### Why

`npm run format:check` fails today because `.github/workflows/sonar.yml` is missing a trailing newline, but `npm run validate` and `.github/workflows/ci.yml` do not run `format:check`. This allows formatting regressions to remain invisible in the default handoff/release command even though the repository has a dedicated formatting checker.

#### How to resolve

- Fix the existing formatting failure in `.github/workflows/sonar.yml` without changing workflow behavior.
- Update `package.json` so `npm run validate` includes `npm run format:check` in a sensible order.
- Update `docs/VALIDATION.md`, `README.md`, and any PR/checklist text if they describe default validation steps and should mention format checking explicitly.
- Confirm CI uses `npm run validate`, so the format check becomes enforced there automatically.
- Run `npm run format:check` and `npm run validate`.

#### Acceptance criteria

- `.github/workflows/sonar.yml` and all tracked checked file types pass `npm run format:check`.
- `npm run validate` includes `format:check`, and CI continues to run `npm run validate`.
- Validation documentation matches the actual script chain.
- `npm run format:check` and `npm run validate` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Make Sonar component file extraction project-key aware

#### Why

`src/sonar/issue-mapping.ts` and `src/sonar/hotspot-mapping.ts` derive `location.file` with `component.indexOf(":")`. Sonar project keys commonly can contain colons, for example Maven-style keys such as `group:artifact`. For a component key like `group:artifact:src/index.ts`, splitting at the first colon displays `artifact:src/index.ts` instead of `src/index.ts`, which misleads agents and users when they inspect issue and hotspot locations.

#### How to resolve

- Add a project-key-aware file extraction strategy for issue and hotspot mappings.
- Prefer an explicit component/path field from Sonar when available; otherwise strip the resolved project key prefix when mapping in tool flows that know the project key.
- If no reliable project key or path field exists, display the full component key rather than an incorrectly sliced path.
- Add tests in `test/sonar-mapping.test.mjs`, `test/list-issues-tool.test.mjs`, and `test/list-security-hotspots-tool.test.mjs` for component keys whose project key contains a colon.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- Issue and hotspot `location.file` values are correct for component keys whose Sonar project key contains one or more colons.
- Existing simple component keys like `demo:src/index.ts` still render as `src/index.ts`.
- When the file path cannot be derived safely, output remains honest and does not show a misleading partial path.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

- [x] Consolidate duplicated issue and hotspot location/rendering helpers

#### Why

Issue and hotspot modules contain parallel implementations for component-to-file mapping, text-range mapping, flow mapping, status rendering, and location rendering. The current duplication already matters because any fix to component-key parsing must be applied consistently in both normal issue and security hotspot flows. Leaving these helpers duplicated raises the maintenance cost of future Sonar compatibility fixes and increases the risk of divergent output between tools.

#### How to resolve

- Identify shared mapping helpers that can move into a common Sonar/location utility without creating a circular dependency.
- Keep domain-specific fields in `src/sonar/issue-mapping.ts` and `src/sonar/hotspot-mapping.ts`, but centralize generic location, text-range, source-snippet, and component-path logic.
- Preserve existing public result shapes and tool output text unless a task intentionally changes them.
- Add or update tests to prove both issue and hotspot mappers still handle locations, secondary locations, flows, and source snippets consistently.
- Validate with `npm run typecheck`, `npm run lint`, and `npm run test`.

#### Acceptance criteria

- Shared location/component parsing logic lives in one reusable module or function set used by both issue and hotspot mappers.
- Existing issue and hotspot mapping tests continue to pass, with added coverage for the shared helper behavior.
- The refactor is limited to shared parsing/rendering behavior and does not include unrelated rewrites.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass, or any remaining blocker is documented with the exact failing command and reason.

## Blocked checks or areas not reviewed

- Live SonarQube/SonarCloud compatibility across versions was not verified because no real credentials or server matrix were available.
- TypeScript does not include `test/*.mjs`; tests were reviewed through Node test execution and static reading rather than TS type checking.
- The default aggregate `npm run validate` was deferred because `npm run test` is already known to fail on the missing `specs/spec-tasks.md`.
- No implementation, formatting fix, dependency update, generated file update, or documentation fix was applied during this review pass.
