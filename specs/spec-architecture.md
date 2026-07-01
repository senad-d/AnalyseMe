# Plan: AnalyseMe Architecture

## Task Description
Prepare the architecture blueprint for AnalyseMe, a TypeScript Pi extension that will give agents read-only access to SonarQube and SonarCloud analysis data through custom tools and a read-only configuration command.

## Objective
Define the future implementation architecture for AnalyseMe without implementing runtime features during preparation. The architecture must support local `.env` usage, CI/GitHub Actions environment variables, SonarQube/SonarCloud read-only API access, truncation-safe tool output, and a configuration TUI that follows `specs/spec-configuration-tui-design-standard.md`.

## Problem Statement
Pi agents need enough SonarQube/SonarCloud context to fix scan findings, but they should not require browser access or broad Sonar permissions. AnalyseMe will expose focused tools that retrieve project summary data, active issue lists, and detailed issue/rule information, including Sonar-provided guidance and issue location details. The extension must avoid mutating Sonar state and must protect the API token in local and CI environments.

## Solution Approach
Build a small Pi package around one extension entry point. Keep `src/extension.ts` minimal and delegate future behavior to registration modules. Separate configuration loading, Sonar API communication, response shaping, command/TUI rendering, and reusable formatting/truncation helpers. Treat SonarQube and SonarCloud as the same HTTP integration with optional `organization` support where APIs require it.

## Relevant Files
Use these files to complete the later implementation:

- `src/extension.ts` — extension factory; imports and calls future `register*` functions only.
- `src/constants.ts` — display name, status key, tool names, command name, environment variable names, safe defaults.
- `src/config/load-config.ts` — future config loader for process env plus local `.env`.
- `src/config/project-key.ts` — future current-project key resolver for explicit args, `SONARQUBE_PROJECT_KEY`, and `sonar-project.properties`.
- `src/config/analysis-scope.ts` — future branch/PR scope resolver for explicit args, env/`.env`, and GitHub Actions context.
- `src/config/git-diagnostics.ts` — future `.git/config` remote-name diagnostics; never automatic project-key selection.
- `src/config/types.ts` — future config types and validation result types.
- `src/sonar/client.ts` — future Sonar HTTP client wrapper using `fetch`, `AbortSignal`, token auth, URL normalization, and error mapping.
- `src/sonar/endpoints.ts` — future endpoint builders for SonarQube/SonarCloud APIs.
- `src/sonar/issue-mapping.ts` — future mapping from Sonar issue/rule/source responses to agent-friendly shapes.
- `src/sonar/hotspot-mapping.ts` — future mapping from Sonar security hotspot responses to agent-friendly shapes.
- `src/tools/project-summary.ts` — future `analyseme_get_project_summary` tool registration.
- `src/tools/list-issues.ts` — future `analyseme_list_issues` tool registration.
- `src/tools/get-issue.ts` — future `analyseme_get_issue` tool registration.
- `src/tools/list-security-hotspots.ts` — future `analyseme_list_security_hotspots` tool registration.
- `src/tools/get-security-hotspot.ts` — future `analyseme_get_security_hotspot` tool registration.
- `src/commands/analyseme.ts` — future `/analyseme` and `/analyseme help` command registration.
- `src/ui/config-tui.ts` — future read-only configuration TUI renderer; must follow `specs/spec-configuration-tui-design-standard.md`.
- `src/utils/truncation.ts` — future output truncation helpers using Pi truncation utilities.
- `src/utils/mask.ts` — future secret masking helpers.
- `test/*.test.mjs` — metadata/preparation tests now; future config/client/mapper tests later.
- `README.md`, `SECURITY.md`, `docs/PROJECT_DEFINITION_BRIEF.md`, `docs/STRUCTURE.md` — user-facing and implementation guidance.
- `specs/spec-configuration-tui-design-standard.md` — mandatory visual design source for the `/analyseme` config TUI.

### New Files
Future implementation may create:

- `src/config/load-config.ts`
- `src/config/project-key.ts`
- `src/config/analysis-scope.ts`
- `src/config/git-diagnostics.ts`
- `src/config/types.ts`
- `src/sonar/client.ts`
- `src/sonar/endpoints.ts`
- `src/sonar/issue-mapping.ts`
- `src/tools/project-summary.ts`
- `src/tools/list-issues.ts`
- `src/tools/get-issue.ts`
- `src/tools/list-security-hotspots.ts`
- `src/tools/get-security-hotspot.ts`
- `src/commands/analyseme.ts`
- `src/ui/config-tui.ts`
- `src/utils/truncation.ts`
- `src/utils/mask.ts`

## Implementation Phases

### Phase 1: Foundation
- Replace template placeholders with AnalyseMe identity and non-functional placeholders only.
- Add preparation-level tests for package metadata and spec presence.
- Keep the extension runtime inert until a separate implementation session begins.

### Phase 2: Core Implementation
- Implement config loading from environment variables and local `.env`.
- Implement current-project key resolution from explicit tool args, optional `SONARQUBE_PROJECT_KEY`, and `sonar-project.properties`; use `.git/config` remote names only as diagnostics.
- Implement optional branch/PR analysis scope resolution from explicit tool args, env/`.env`, and GitHub Actions context; reject configurations that provide both `branch` and `pullRequest`.
- Implement the Sonar API client with read-only requests, error handling, token masking, and optional organization support.
- Register five tools with TypeBox schemas, prompt snippets, and prompt guidelines.
- Implement active issue filtering to exclude false-positive, ignored, accepted/resolved, or otherwise non-active issues.
- Implement issue detail aggregation from issue, component/source, and rule metadata endpoints where available.

### Phase 3: Integration & Polish
- Implement `/analyseme` read-only config TUI according to the design standard.
- Implement `/analyseme help` with local and GitHub Actions setup examples.
- Add unit tests for config loading, endpoint building, issue filtering, response shaping, truncation, and masking.
- Run full validation and isolated Pi smoke testing.

## Pi Extension Surfaces

| Surface | Name | Purpose | Architecture notes |
| --- | --- | --- | --- |
| Command | `/analyseme` | Show read-only configuration/status TUI | Must not write `.env`; must mask token; must follow `specs/spec-configuration-tui-design-standard.md`. |
| Command | `/analyseme help` | Show concise setup and tool usage tips | Should work in TUI, print, JSON, and RPC modes without requiring custom TUI. |
| Tool | `analyseme_get_project_summary` | Return project quality/metric summary | `projectKey` optional; supports optional `organization`, `branch`, and `pullRequest`; read-only; truncation-safe. |
| Tool | `analyseme_list_issues` | Return active issues for a project | `projectKey` optional; supports optional `organization`, `branch`, and `pullRequest`; excludes non-active results. |
| Tool | `analyseme_get_issue` | Return issue location and Sonar rule guidance | Requires issue key/id; project/org/scope optional when needed for links/context; includes only Sonar-provided fix guidance. |
| Tool | `analyseme_list_security_hotspots` | Return security hotspots requiring review | `projectKey` optional; supports optional `organization`, `branch`, and `pullRequest`; read-only; truncation-safe. |
| Tool | `analyseme_get_security_hotspot` | Return security hotspot detail and guidance | Requires hotspot key/id; includes only Sonar-provided hotspot/security guidance. |
| Event | `session_start`/`session_shutdown` | Optional lightweight status only | Do not start background work from extension factory. |
| Resource | none | No skills/prompts/themes planned | Do not add package resources unless a later decision changes scope. |

## Data Flow

1. Agent calls an `analyseme_*` tool or user runs `/analyseme`.
2. Config layer reads `SONARQUBE_URL`, `SONARQUBE_TOKEN`, and optional `SONARQUBE_ORGANIZATION` from process environment and local `.env`.
3. Tool parameters may provide `projectKey`, optional `organization`, and optional analysis scope (`branch` or `pullRequest`). Parameter `organization` overrides `SONARQUBE_ORGANIZATION` for that call. If `projectKey` is omitted, resolve it from `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`; `.git/config` remote names are diagnostics only. If scope is omitted, resolve it from `SONARQUBE_BRANCH`/`SONARQUBE_PULL_REQUEST`, then GitHub Actions context.
4. Sonar client normalizes URL, applies token auth, appends request query parameters, and sends read-only requests with the provided `AbortSignal`.
5. Response mapping converts Sonar payloads into compact agent-oriented data structures.
6. Truncation helpers limit large text outputs and include explicit truncation notices.
7. Tool result `content` contains concise markdown/text for the agent; `details` contains structured data, config source flags, request metadata without secrets, and truncation metadata.

## Config, State, and Persistence

- Required environment variables: `SONARQUBE_URL`, `SONARQUBE_TOKEN`.
- Optional environment variables: `SONARQUBE_ORGANIZATION`, `SONARQUBE_PROJECT_KEY`, `SONARQUBE_BRANCH`, `SONARQUBE_PULL_REQUEST`.
- `projectKey` should be optional in tools. Resolution order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, `sonar-project.properties` `sonar.projectKey`.
- Analysis scope should be optional in tools. Resolution order: explicit `branch`/`pullRequest`, `SONARQUBE_BRANCH`/`SONARQUBE_PULL_REQUEST`, then GitHub Actions context (`GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GITHUB_REF`, `GITHUB_EVENT_PATH`).
- `branch` and `pullRequest` are mutually exclusive; if both are configured, throw a clear configuration error rather than guessing.
- `.git/config` remote names may help diagnostics but must not be used as automatic Sonar project keys because repository names often differ from Sonar keys.
- Local `.env` support is for developer convenience only; CI should provide environment variables/secrets.
- Runtime must not write `.env`, settings files, cache files, or Sonar state.
- Branch-sensitive state should live in tool result `details` if any is needed; no persistent extension state is currently required.
- Reconstruct any future state from current branch/session entries on `session_start` rather than global mutable files.

## Sonar API Boundaries

The future implementation should prefer read-only endpoints such as:

- `GET /api/qualitygates/project_status` for project quality gate status.
- `GET /api/measures/component` for summary metrics, with `component=<projectKey>` and explicit `metricKeys`.
- `GET /api/issues/search` for active issue listing, using project scope, optional `branch` or `pullRequest` query parameter when configured, conservative pagination, and server-side active filters where available.
- `GET /api/issues/search` with `issues=<issueKey>` and `additionalFields=_all` for a specific issue.
- `GET /api/rules/show` with `key=<ruleKey>` for Sonar-provided rule description, remediation, clean-code guidance, and examples where exposed by the API.
- `GET /api/sources/issue_snippets` when available, falling back to `GET /api/sources/show` with a narrow line window, to reproduce "Where is the issue?" details from read-only source APIs.
- `GET /api/hotspots/search` for security hotspot listings because hotspots are separate from normal issues.
- `GET /api/hotspots/show` for a specific security hotspot and Sonar-provided security guidance.

Implementation must not call APIs that mutate issues, change statuses, assign users, add comments, mark false positives, or update project configuration.

## Output Contracts

### `analyseme_get_project_summary`
Return:

- Resolved project key, project-key source, optional organization, and optional branch/PR scope.
- Sonar instance type hint when inferable.
- Quality gate or summary status when available.
- Core metrics useful to agents, such as bugs, vulnerabilities, code smells, security hotspots, coverage, duplicated lines, reliability/security/maintainability ratings, and analysis date when available.
- Warnings for missing metrics or partial data.

### `analyseme_list_issues`
Return:

- Resolved project key, project-key source, optional organization, and optional branch/PR scope.
- Active issue count and pagination summary.
- Issue rows with key, severity/impact, type, status/resolution, rule, component/file, line/range when available, message, and tags when available.
- Exclusion note explaining false-positive/ignored/accepted/resolved-like results are omitted.
- Truncation note when output is shortened.

### `analyseme_get_issue`
Return:

- Issue key, message, severity/impact, type, status/resolution, rule key/name, component/file, line/range, text range, flows/secondary locations when available.
- "Where is the issue?" style location context from Sonar issue/source APIs where available.
- Rule metadata and Sonar-provided fix guidance/examples only; do not invent remediation guidance inside the tool.
- Links to the Sonar issue/rule when URL construction is safe.

### `analyseme_list_security_hotspots`
Return:

- Resolved project key, project-key source, optional organization, and optional branch/PR scope.
- Hotspot count and pagination summary.
- Hotspot rows with key, status/resolution, vulnerability probability, security category, component/file, line/range when available, message, assignee/author when available, and update/creation dates when available.
- Truncation note when output is shortened.

### `analyseme_get_security_hotspot`
Return:

- Hotspot key, message, status/resolution, vulnerability probability, security category, component/file, line/range, text range, and flows/secondary locations when available.
- Sonar-provided security guidance/risk description/fix recommendation when returned by the hotspot API.
- Links to the Sonar hotspot when URL construction is safe.

## Security Boundaries

- Never include `SONARQUBE_TOKEN` in command output, tool output, details, logs, thrown error messages, or test snapshots.
- Mask token display as present/missing and optionally last four characters only if explicitly safe.
- Treat `.env` as sensitive and never include its raw contents in results.
- Do not use shell execution for API calls.
- Use `fetch` with `AbortSignal` instead of spawning `curl`.
- No telemetry, analytics, or outbound calls beyond the configured Sonar base URL.
- User-provided `SONARQUBE_URL` must be normalized and validated before use.

## Pi Documentation Notes to Preserve

- Keep `src/extension.ts` small; import feature modules and call their `register*` functions.
- Do not start long-lived processes, file watchers, timers, sockets, or background jobs directly in the extension factory.
- Start session-scoped resources from `session_start`, a command, or a tool; clean up in `session_shutdown`.
- For tools, define clear TypeBox schemas, descriptions, `promptSnippet`, and `promptGuidelines`; every guideline must name the specific tool.
- Use `StringEnum` from `@earendil-works/pi-ai` for future enum schemas.
- If any future custom tool mutates files, use Pi's file mutation queue helpers and resolve paths safely; current scope is read-only and should not mutate files.
- Truncate large tool outputs and tell the agent when output is truncated.
- Keep Pi core packages in `peerDependencies` with `"*"`; put non-Pi runtime libraries in `dependencies`; put local development tools in `devDependencies`.
- Package resources are declared under `package.json` `pi.extensions`; no additional skills/prompts/themes are planned.

## Testing Strategy

- Unit-test config precedence, project-key resolution, analysis-scope resolution, and masking without real secrets.
- Unit-test endpoint/query builders for SonarQube and SonarCloud organization parameters.
- Unit-test active issue filtering with representative statuses/resolutions.
- Unit-test response mappers for missing fields, secondary locations, rule metadata, and security hotspot metadata.
- Unit-test truncation behavior and visible truncation notices.
- Use mocked `fetch` for API client tests; do not require live Sonar services in default validation.
- Keep an optional manual smoke plan for a real SonarQube/SonarCloud endpoint.

## Acceptance Criteria

- Architecture preserves a strict read-only Sonar boundary.
- Architecture supports local `.env` and CI environment variables.
- Architecture supports optional SonarCloud organization configuration.
- Architecture gives agents project summary, active issue list, issue detail/rule guidance data, and security hotspot review data.
- Architecture references the mandatory configuration TUI visual standard.
- Architecture keeps runtime implementation out of the preparation phase.

## Validation Commands

Execute these commands after future implementation work:

- `npm run typecheck` — TypeScript validation.
- `npm run lint` — lint TypeScript and scripts.
- `npm run test` — unit tests.
- `npm run check:pack` — verify npm package contents.
- `npm run validate` — full repository validation.
- `pi --no-extensions -e .` — isolated Pi smoke test.

## Notes

This document is a blueprint for a later implementation session. During the preparation session, do not implement or register the planned tools, command, TUI, API client, config loader, or event behavior.
