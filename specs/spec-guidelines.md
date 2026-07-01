# Plan: AnalyseMe Implementation Guidelines

## Task Description
Define coding, packaging, documentation, testing, and security guidelines for future AnalyseMe implementation work.

## Objective
Give future implementation sessions clear rules for building AnalyseMe as a safe, read-only Pi extension for SonarQube/SonarCloud analysis retrieval.

## Problem Statement
AnalyseMe will handle credentials and external network calls. Without explicit guidelines, future changes could leak tokens, over-fetch data, mutate Sonar state, or create an extension that is hard for agents to use safely. These guidelines constrain the implementation while leaving feature work to a later session.

## Solution Approach
Use Pi extension best practices, local package conventions, and Sonar read-only boundaries as the standard for every future change. Keep code modular, tested, truncation-safe, and explicit about configuration and security behavior.

## Relevant Files

- `specs/spec-architecture.md` — architectural source of truth.
- `specs/spec-tasks.md` — ordered future task list.
- `specs/spec-configuration-tui-design-standard.md` — mandatory visual standard for `/analyseme` TUI.
- `docs/PROJECT_DEFINITION_BRIEF.md` — approved project definition.
- `README.md` — user-facing setup and usage documentation.
- `SECURITY.md` — security model and reporting process.
- `package.json` — package identity, dependencies, scripts, and Pi manifest.
- `src/extension.ts` — small extension entry point.
- Future `src/config/`, `src/sonar/`, `src/tools/`, `src/commands/`, `src/ui/`, `src/utils/` modules.
- `test/` — unit and metadata tests.

## Implementation Phases

### Phase 1: Preparation Discipline
- Keep all preparation changes non-functional.
- Do not register real tools, commands, events, UI, network calls, file mutation, or config-loading runtime behavior in the preparation session.
- Keep task spec checkboxes unchecked until future implementation work actually completes each task.

### Phase 2: Feature Implementation Discipline
- Implement one task at a time from `specs/spec-tasks.md`.
- Add tests and documentation with each runtime feature.
- Stop and ask when a Sonar API behavior, security decision, or output contract is ambiguous.

### Phase 3: Release Discipline
- Validate with `npm run validate`.
- Run isolated smoke tests with `pi --no-extensions -e .`.
- Verify package dry-run excludes `.env`, `.pi`, specs, caches, coverage, and tarballs.
- Update changelog before any publish.

## Coding Conventions

- Use TypeScript ESM and explicit `.ts` imports, matching the template.
- Prefer small modules with single responsibilities.
- Use type-only imports for types to satisfy lint rules.
- Keep `src/extension.ts` small; it should only import feature modules and call their `register*` functions.
- Name exported registration functions by feature, for example `registerAnalyseMeTools(pi)` or `registerAnalyseMeCommand(pi)`.
- Keep API response types narrow and defensive; Sonar instances may differ by version/product.
- Validate and normalize external strings before rendering or constructing URLs.
- Avoid global mutable state. If any branch-sensitive state is needed, store it in tool result `details` and reconstruct from session branch entries on `session_start`.
- Do not over-engineer directories; create a new module when it isolates config, Sonar API, command/UI, tool, or formatting responsibilities.

## Pi Extension Best Practices

- Do not start long-lived processes, file watchers, timers, sockets, or background jobs directly in the extension factory.
- Start session-scoped resources from `session_start`, a command, or a tool; clean them up in `session_shutdown`.
- Do not use shell execution for HTTP requests; use Node `fetch` with `AbortSignal`.
- Register tools with TypeBox schemas, clear descriptions, `promptSnippet`, and `promptGuidelines`.
- Every `promptGuidelines` bullet must name the specific tool, such as `analyseme_list_issues`, not "this tool".
- Use `StringEnum` from `@earendil-works/pi-ai` for any future string enum schema fields.
- Throw errors from tool `execute` when execution should be marked failed; do not return fake error objects as successful results.
- Keep tool outputs compact and use Pi truncation helpers for large output.
- Always tell the agent when output is truncated and include structured truncation metadata in `details`.
- Do not override built-in Pi tools.
- Use `ctx.mode === "tui"` before TUI-only interactions and `ctx.hasUI` before dialogs/notifications.

## Package Metadata Rules

- Package name: `@senad-d/pi-analyseme`.
- Display name: `AnalyseMe`.
- Keep `pi.extensions` pointed at `./src/extension.ts` unless the entry point changes intentionally.
- Keep Pi core packages in `peerDependencies` with `"*"`:
  - `@earendil-works/pi-coding-agent`
  - `typebox`
  - add `@earendil-works/pi-ai` with `"*"` if `StringEnum` is used.
  - add `@earendil-works/pi-tui` with `"*"` if imported directly by runtime code.
- Put non-Pi runtime libraries in `dependencies`.
- Put local development tools in `devDependencies`.
- Do not package `.env`, `.pi`, specs, caches, generated reports, coverage, build output, or tarballs.
- Keep `pi-package` and `pi-extension` keywords for discoverability.

## Configuration Rules

- Required configuration:
  - `SONARQUBE_URL`
  - `SONARQUBE_TOKEN`
- Optional configuration:
  - `SONARQUBE_ORGANIZATION`
  - `SONARQUBE_PROJECT_KEY`
  - `SONARQUBE_BRANCH`
  - `SONARQUBE_PULL_REQUEST`
- Local `.env` is for developer convenience. CI/GitHub Actions should provide environment variables from secrets.
- Tool parameters may include `projectKey`; if omitted, resolve it from `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`.
- `.git/config` remote names may be shown as diagnostics/suggestions only and must not be used as automatic Sonar project keys.
- Tool parameter `organization`, when present, overrides `SONARQUBE_ORGANIZATION` for that tool call.
- Tool parameters may include `branch` or `pullRequest`; if omitted, resolve from `SONARQUBE_BRANCH`/`SONARQUBE_PULL_REQUEST`, then GitHub Actions context.
- `branch` and `pullRequest` are mutually exclusive; throw a clear configuration error if both are present.
- The `/analyseme` config TUI is read-only; it must never write or edit `.env`.
- Do not expose raw `.env` contents through tool or command output.

## Sonar API Rules

- Only call read-only SonarQube/SonarCloud REST APIs.
- Do not call endpoints that change issue status, assign issues, add comments, set false positives, mark accepted, or update project settings.
- Use token auth according to Sonar API expectations; keep implementation flexible for SonarQube and SonarCloud.
- Normalize `SONARQUBE_URL` by trimming whitespace and removing trailing slashes.
- Validate URL scheme and host enough to produce useful errors without blocking legitimate self-hosted instances.
- Add `organization` query parameter only when configured or passed and when the target endpoint accepts it.
- Add exactly one of `branch` or `pullRequest` query parameters when a branch/PR scope is configured and the endpoint accepts it.
- Use explicit read-only endpoints: `/api/qualitygates/project_status`, `/api/measures/component`, `/api/issues/search`, `/api/rules/show`, source snippet endpoints such as `/api/sources/issue_snippets` or `/api/sources/show` when available, and hotspot endpoints `/api/hotspots/search` and `/api/hotspots/show`.
- Implement conservative pagination. Do not fetch unbounded pages without explicit maximums.
- Use active issue filters that omit false-positive, ignored, accepted, resolved, closed, or equivalent non-actionable results.
- Treat security hotspots as separate from normal issues; do not rely on issue APIs to cover hotspot review data.
- Issue detail output should reflect Sonar data. If Sonar does not return source snippets or fix guidance, say it is unavailable rather than inventing it.

## Output and Truncation Rules

- Tool result `content` should be concise, markdown/text, and immediately useful to an agent.
- Tool result `details` should include structured data for follow-up reasoning but no secrets.
- Include `projectKey`, optional `organization`, Sonar endpoint origin without token, query/page metadata, and truncation metadata in `details`.
- Prefer summaries and issue rows over raw JSON dumps.
- For long issue or hotspot lists, return the first actionable results up to the limit, state how many are shown, and expose pagination metadata.
- Truncate large strings, rule descriptions, code snippets, and aggregated outputs.
- Sanitize terminal control sequences in external strings before TUI rendering.
- Never let rendered TUI lines exceed terminal width.

## Configuration TUI Rules

- `/analyseme` must implement a read-only config/status TUI.
- The TUI must follow `specs/spec-configuration-tui-design-standard.md`:
  - wide mode uses framed two-pane layout,
  - narrow mode uses framed one-pane layout,
  - tiny mode uses no-border fallback,
  - selection marker is `▶ `,
  - footer separator is ` • `,
  - values are right-aligned and styled by semantic type,
  - all lines fit width.
- The TUI should show categories such as Connection, SonarCloud, Local `.env`, CI/GitHub Actions, Tools, and Security.
- Values should be presence/status labels, not raw secrets.
- Token value should be `present`/`not set` or a similarly safe masked label.
- Read-only source/target line should make clear that the TUI writes nothing.
- `/analyseme help` should provide concise non-interactive tips for users and agents.

## Documentation Rules

- README must clearly label planned-but-not-yet-implemented features until they exist.
- README must include local `.env` and GitHub Actions setup examples without real secrets.
- SECURITY must document credential handling, network access, file access, no telemetry, and read-only Sonar behavior.
- CHANGELOG should record preparation and later feature milestones.
- Docs must avoid promising implemented runtime behavior until tests and validation prove it.
- Keep repository references consistent with `https://github.com/senad-d/pi-analyseme`.

## Testing Rules

- Default validation must not require live SonarQube/SonarCloud credentials.
- Use mocked `fetch` for API client tests.
- Unit tests should cover:
  - config source precedence,
  - project-key resolution from explicit args, `SONARQUBE_PROJECT_KEY`, and `sonar-project.properties`,
  - analysis-scope resolution and branch/PR mutual exclusion,
  - missing config error messages,
  - token masking,
  - URL normalization,
  - SonarCloud organization handling,
  - active issue filtering,
  - issue detail/rule mapping,
  - security hotspot list/detail mapping,
  - truncation notices,
  - config TUI line-width behavior.
- Add integration/smoke test instructions for real Sonar endpoints, but keep them opt-in.
- Run `npm run validate` before handoff or release.
- Use `pi --no-extensions -e .` for isolated Pi smoke tests; do not use `pi -e .` unless intentionally loading other configured extensions.

## Security and Privacy Rules

- Never log or return `SONARQUBE_TOKEN`.
- Redact secrets in thrown errors and tool details.
- Treat Sonar issue messages, file paths, source snippets, and rule metadata as project-sensitive.
- Do not send telemetry.
- Do not persist retrieved Sonar data outside normal Pi session/tool result storage.
- Do not write files, mutate repositories, or mutate Sonar state from AnalyseMe tools.
- Do not execute shell commands.
- Network access is limited to the configured Sonar URL.
- Document that Pi packages run with full local permissions and should be installed only from trusted sources.

## Acceptance Criteria

- Future implementation follows Pi extension/package docs.
- Future tools are clear, read-only, truncation-safe, and schema-driven.
- Future `/analyseme` TUI follows the existing design standard.
- Future config handling works both locally and in GitHub Actions without leaking secrets.
- Future documentation and tests stay aligned with actual behavior.

## Validation Commands

Execute during future implementation and before release:

- `npm run typecheck` — compile-time type validation.
- `npm run lint` — lint TypeScript and scripts.
- `npm run test` — unit tests.
- `npm run check:pack` — package dry-run safety check.
- `npm run validate` — full validation.
- `pi --no-extensions -e .` — isolated Pi smoke test.

## Notes

These guidelines are normative for future implementation. If a task conflicts with these guidelines, ask which decision wins before coding.
