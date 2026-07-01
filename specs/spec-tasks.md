# Plan: AnalyseMe Future Implementation Tasks

## Task Description
Ordered task spec for a later, separate implementation session that will turn the prepared AnalyseMe repository into a working Pi extension.

## Objective
Provide a checkbox-based implementation plan. Every task is intentionally unchecked during preparation. Implementers should complete one task at a time, update tests/docs with each feature change, and validate continuously.

## Problem Statement
AnalyseMe needs multiple coordinated pieces: safe configuration loading, SonarQube/SonarCloud API access, Pi tool registration, read-only config UI, documentation, and validation. This task spec breaks that work into testable steps while preserving security and preparation boundaries.

## Solution Approach
Start with config and API foundations, then add tools, command/TUI, tests, docs, and validation. Follow `specs/spec-architecture.md`, `specs/spec-guidelines.md`, and `specs/spec-configuration-tui-design-standard.md`.

## Relevant Files

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-configuration-tui-design-standard.md`
- `src/extension.ts`
- `src/constants.ts`
- Future `src/config/`, `src/sonar/`, `src/tools/`, `src/commands/`, `src/ui/`, `src/utils/`
- `test/`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `package.json`

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom. Keep each checkbox unchecked until the task is actually implemented in a separate implementation session.

### 1. Establish Runtime Module Skeleton

- [ ] Create the runtime module skeleton for config, Sonar API, tools, commands, UI, and utilities without adding network behavior yet.

Create directories and minimal exported types/functions that future tasks can fill in. Update `src/extension.ts` only to call registration functions when the related feature is implemented, not before.

#### Acceptance criteria

- `src/extension.ts` remains small and only delegates to implemented `register*` functions.
- No placeholder command/tool/event is registered unless its implementation and tests are included in the same task.
- Lint and typecheck pass after the skeleton is added.

### 2. Implement Safe Configuration Loading

- [ ] Implement configuration loading from process environment and local `.env` with token masking and validation.

Support `SONARQUBE_URL`, `SONARQUBE_TOKEN`, optional `SONARQUBE_ORGANIZATION`, optional `SONARQUBE_PROJECT_KEY`, optional `SONARQUBE_BRANCH`, and optional `SONARQUBE_PULL_REQUEST`. Resolve project keys from explicit tool args, `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`; inspect `.git/config` remote names only for diagnostics/suggestions. Resolve analysis scope from explicit `branch`/`pullRequest`, env/`.env`, then GitHub Actions context. Reject configurations that provide both branch and pull request. Do not write `.env`.

#### Acceptance criteria

- Config loading works when values come from environment variables.
- Config loading works when values come from local `.env`.
- Environment variables take precedence over `.env` values when both are present.
- Project-key resolution works from explicit argument, `SONARQUBE_PROJECT_KEY`, and `sonar-project.properties`.
- `.git/config` remote names are diagnostic only and are not used as automatic Sonar project keys.
- Analysis-scope resolution works from explicit argument, env/`.env`, and GitHub Actions context.
- Providing both branch and pull request produces a clear configuration error.
- Missing required values produce actionable errors without exposing secrets.
- Unit tests cover success, missing values, precedence, URL normalization, project-key resolution, analysis-scope resolution, and token masking.

### 3. Implement Sonar Read-Only HTTP Client

- [ ] Implement a SonarQube/SonarCloud HTTP client wrapper for read-only REST API requests.

Use Node `fetch`, pass `AbortSignal`, normalize base URLs, apply token authentication, construct query strings safely, and map HTTP/API errors to useful messages. Do not use shell commands.

#### Acceptance criteria

- Client supports configured SonarQube and SonarCloud URLs.
- Client appends optional `organization` where requested by callers.
- Client uses abort-aware fetch calls.
- Client error messages redact tokens and avoid dumping sensitive headers.
- Tests use mocked `fetch`; default validation requires no live Sonar service.

### 4. Implement Endpoint Builders and Active Issue Filtering

- [ ] Implement endpoint/query builders and active issue/security hotspot filtering for project summary, issue search, issue detail, rule detail, hotspot list/detail, and optional source/location APIs. Use `/api/qualitygates/project_status`, `/api/measures/component`, `/api/issues/search`, `/api/rules/show`, source snippet endpoints such as `/api/sources/issue_snippets` or `/api/sources/show` when available, and hotspot endpoints `/api/hotspots/search` and `/api/hotspots/show`.

Represent Sonar API parameters in typed helpers. Filter out false-positive, ignored, accepted, resolved, closed, or equivalent non-active issue results. Treat security hotspots as a separate API family from normal issues.

#### Acceptance criteria

- Endpoint builders produce expected paths/query strings for SonarQube and SonarCloud-style calls.
- Active issue filtering keeps actionable/open issues and excludes non-actionable statuses/resolutions.
- Tests cover representative Sonar issue and hotspot payload variants and missing fields.
- Filtering behavior is documented in code comments or README.

### 5. Implement Response Mapping and Truncation Utilities

- [ ] Implement response mappers and truncation helpers for agent-safe Sonar output.

Map raw Sonar responses to compact summary, issue list, and issue detail shapes. Use Pi truncation utilities for long content and include explicit truncation notices.

#### Acceptance criteria

- Mappers handle missing optional fields without crashing.
- Issue detail mapping includes file/component, line/range, text range, flows/secondary locations, and rule metadata when available.
- Security hotspot mapping includes file/component, line/range, status/resolution, vulnerability probability, security category, and Sonar-provided security guidance when available.
- Rule and hotspot guidance is sourced only from Sonar API metadata.
- Truncated outputs clearly say they are truncated and include truncation metadata in `details`.
- Tests cover long output and missing guidance/source scenarios.

### 6. Register `analyseme_get_project_summary`

- [ ] Implement and register the `analyseme_get_project_summary` Pi tool.

The tool should accept optional `projectKey`, `organization`, `branch`, and `pullRequest`, use config/client modules to resolve missing project keys/scope, and return concise project summary data.

#### Acceptance criteria

- Tool schema is TypeBox-based and includes clear parameter descriptions.
- Tool has `description`, `promptSnippet`, and `promptGuidelines` that explicitly name `analyseme_get_project_summary`.
- Tool returns project key/source, optional organization, optional branch/PR scope, summary metrics/status, warnings for partial data, and structured `details` without secrets.
- Tests cover the tool with mocked Sonar responses.
- `npm run typecheck`, `npm run lint`, and `npm run test` pass.

### 7. Register `analyseme_list_issues`

- [ ] Implement and register the `analyseme_list_issues` Pi tool.

The tool should accept optional `projectKey`, `organization`, `branch`, and `pullRequest`, resolve missing project keys/scope from current-project config, retrieve active issues, exclude non-active issue results, and return agent-friendly issue rows.

#### Acceptance criteria

- Tool schema is TypeBox-based and includes clear parameter descriptions.
- Tool has `description`, `promptSnippet`, and `promptGuidelines` that explicitly name `analyseme_list_issues`.
- Tool excludes false-positive, ignored, accepted, resolved, closed, or equivalent non-active results.
- Tool returns issue key, severity/impact, type, status/resolution, rule, component/file, line/range, message, and pagination/truncation metadata when available.
- Tests cover active filtering, pagination metadata, and truncation.

### 8. Register `analyseme_get_issue`

- [ ] Implement and register the `analyseme_get_issue` Pi tool.

The tool must fetch a specific issue and include location details matching the intent of Sonar's "Where is the issue?" section, plus Sonar-provided rule guidance where available.

#### Acceptance criteria

- Tool schema is TypeBox-based and includes clear parameter descriptions for issue key/id, optional organization, optional branch/PR scope, and optional project context used for links/source lookup.
- Tool has `description`, `promptSnippet`, and `promptGuidelines` that explicitly name `analyseme_get_issue`.
- Tool output includes issue key, message, status, severity/impact, rule key/name, component/file, line/range, text range, flows/secondary locations, and source/location snippets when available from read-only APIs.
- Tool output includes only Sonar-provided rule guidance/examples; it does not invent remediation advice.
- Tests cover issue found, issue not found, missing source context, missing rule guidance, and truncation.

### 9. Register `analyseme_list_security_hotspots`

- [ ] Implement and register the `analyseme_list_security_hotspots` Pi tool.

Security hotspots are separate from normal issues in SonarQube/SonarCloud. The tool should accept optional `projectKey`, `organization`, `branch`, and `pullRequest`, resolve missing project keys/scope from current-project config, retrieve hotspots requiring review, and return agent-friendly hotspot rows.

#### Acceptance criteria

- Tool schema is TypeBox-based and includes clear parameter descriptions.
- Tool has `description`, `promptSnippet`, and `promptGuidelines` that explicitly name `analyseme_list_security_hotspots`.
- Tool uses `/api/hotspots/search` or the current read-only hotspot listing API for the target Sonar version/product.
- Tool returns hotspot key, status/resolution, vulnerability probability, security category, component/file, line/range, message, date metadata, and pagination/truncation metadata when available.
- Tests cover hotspot listing, branch/PR scope, pagination metadata, and truncation.

### 10. Register `analyseme_get_security_hotspot`

- [ ] Implement and register the `analyseme_get_security_hotspot` Pi tool.

The tool must fetch a specific security hotspot and include Sonar-provided security guidance/risk information where available. It must not invent remediation advice.

#### Acceptance criteria

- Tool schema is TypeBox-based and includes clear parameter descriptions for hotspot key/id, optional organization, optional branch/PR scope, and optional project context used for links/source lookup.
- Tool has `description`, `promptSnippet`, and `promptGuidelines` that explicitly name `analyseme_get_security_hotspot`.
- Tool uses `/api/hotspots/show` or the current read-only hotspot detail API for the target Sonar version/product.
- Tool output includes hotspot key, message, status/resolution, vulnerability probability, security category, component/file, line/range, text range, flows/secondary locations, and Sonar-provided security guidance/risk details when available.
- Tests cover hotspot found, hotspot not found, missing guidance/source context, and truncation.

### 11. Implement `/analyseme help`

- [ ] Implement `/analyseme help` with concise setup tips, local `.env` example, GitHub Actions example, and tool usage guidance.

Help should work in non-TUI modes and should not require network access or valid credentials.

#### Acceptance criteria

- `/analyseme help` explains required and optional configuration variables.
- Help output includes safe local `.env` and GitHub Actions snippets with placeholder secrets only.
- Help lists the five AnalyseMe tools, project-key resolution order, branch/PR scope resolution, and required/optional inputs.
- Help clearly states tools are read-only and never mutate Sonar issues.
- Tests or smoke checks verify the command can run without configured credentials.

### 12. Implement Read-Only `/analyseme` Config TUI

- [ ] Implement the `/analyseme` read-only configuration/status TUI according to `specs/spec-configuration-tui-design-standard.md`.

The TUI should show connection/config presence, optional SonarCloud organization, local `.env` status, CI/GitHub Actions guidance, tool list, and security notes. It must not write files.

#### Acceptance criteria

- Wide screens render the two-pane framed layout.
- Narrow screens render the one-pane framed layout.
- Tiny screens render the no-border four-line fallback.
- Selection marker is `▶ ` and footer separator is ` • `.
- Values are right-aligned and styled by semantic type.
- Token display is masked/presence-only and never reveals the token.
- TUI performs no file writes and no network calls.
- Tests cover renderer line width and representative wide/narrow/tiny layouts.

### 13. Add Optional Lightweight Lifecycle Status

- [ ] Add optional `session_start`/`session_shutdown` status behavior after commands/tools are implemented.

Show that AnalyseMe is loaded without starting background work. Clear the status on shutdown.

#### Acceptance criteria

- Lifecycle handlers do not start network calls, timers, watchers, sockets, or background jobs.
- Status is set on `session_start` and cleared on `session_shutdown` only if UI status is available.
- Behavior works safely in TUI/RPC and does not break print/JSON modes.
- Tests or smoke checks confirm no side effects beyond status display.

### 14. Update Documentation for Implemented Behavior

- [ ] Update README, SECURITY, CHANGELOG, and structure docs to describe implemented behavior accurately.

Replace any "planned" labels only after matching implementation and tests exist.

#### Acceptance criteria

- README includes installation, local `.env`, GitHub Actions, commands, tools, troubleshooting, and validation sections.
- SECURITY documents credential handling, read-only network behavior, no telemetry, no Sonar writes, and reporting guidance.
- CHANGELOG records implemented features.
- Documentation does not claim unimplemented behavior.
- Examples use placeholders and never include real secrets.

### 15. Add End-to-End Validation and Smoke Instructions

- [ ] Add final validation coverage and smoke-test instructions for AnalyseMe.

Default validation should stay offline/mocked. Real Sonar testing should be documented as an optional manual step requiring credentials.

#### Acceptance criteria

- `npm run validate` passes without live Sonar credentials.
- `npm run check:pack` confirms forbidden files are excluded.
- `pi --no-extensions -e .` loads the extension in isolation.
- Optional manual instructions describe how to test against real SonarQube/SonarCloud without printing secrets.
- Package dry-run does not include `.env`, `.pi`, specs, caches, generated reports, coverage, build output, or tarballs.

## Testing Strategy

- Use Node test runner and mocked `fetch` for default tests.
- Avoid live Sonar dependencies in CI.
- Add focused unit tests with representative Sonar issue and hotspot payload fixtures.
- Add renderer tests for config TUI line-width and masking behavior.
- Run full repository validation after every feature group.

## Acceptance Criteria

- All tasks remain unchecked until implemented in a separate implementation session.
- Future implementation follows the architecture and guidelines specs.
- Tools and commands are read-only, secret-safe, and truncation-safe.
- Config supports local `.env` and CI/GitHub Actions environment variables.
- `/analyseme` TUI follows the existing configuration design standard.

## Validation Commands

Execute these commands throughout future implementation:

- `npm run typecheck` — TypeScript validation.
- `npm run lint` — lint TypeScript and scripts.
- `npm run test` — unit tests.
- `npm run check:pack` — package dry-run safety check.
- `npm run validate` — full validation.
- `pi --no-extensions -e .` — isolated Pi smoke test.

## Notes

Do not run this task spec through subagents during preparation. Do not mark any checkbox complete during preparation. Start implementation in a new session after preparation is finished.
