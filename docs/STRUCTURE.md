# AnalyseMe Structure Guide

AnalyseMe is a TypeScript Pi extension package that exposes read-only SonarQube/SonarCloud commands and tools.

## Current runtime layout

```text
src/
├── extension.ts          # small entry point; delegates to implemented registrations
├── constants.ts          # shared names, command/tool names, env var names
├── commands/             # /analyseme and /analyseme help
├── config/               # env/.env, sonar-project.properties, scope, and git diagnostics
├── events/               # lightweight session status lifecycle hooks
├── sonar/                # Sonar API client, endpoint builders, and response mappers
├── tools/                # analyseme_* tool registrations and shared tool helpers
├── ui/                   # read-only config/status renderer
└── utils/                # masking and truncation helpers
```

## Implemented Pi surfaces

- `/analyseme` — read-only configuration/status output with masked token presence.
- `/analyseme help` — setup and tool usage tips.
- `analyseme_get_project_summary` — read project quality gate and summary metrics.
- `analyseme_list_issues` — list active actionable issues only.
- `analyseme_get_issue` — retrieve issue location, source context where available, flows, and Sonar rule guidance.
- `analyseme_list_security_hotspots` — list security hotspots requiring review.
- `analyseme_get_security_hotspot` — retrieve hotspot details, source context where available, flows, and Sonar-provided security guidance.
- `session_start`/`session_shutdown` — set/clear lightweight “AnalyseMe loaded” status when UI status is available.

## Implementation boundaries

- Keep `src/extension.ts` small. It imports feature modules and calls implemented `register*` functions only.
- Do not start background processes, timers, watchers, sockets, or long-lived jobs from the extension factory.
- Keep tools read-only against SonarQube/SonarCloud.
- Resolve project keys in this order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, `sonar-project.properties` `sonar.projectKey`; treat `.git/config` remote names as diagnostics only.
- Resolve optional analysis scope from explicit `branch`/`pullRequest`, env/`.env`, or GitHub Actions context; reject configurations that provide both branch and pull request.
- Do not mutate repository files or `.env` from runtime code.
- Do not expose raw `SONARQUBE_TOKEN` in output, errors, logs, or tests.
- Use Node `fetch` for HTTP; do not shell out to API clients.
- Truncate large tool output and include visible truncation notices.
- Keep Pi core packages in `peerDependencies` with `"*"`.

## Configuration TUI requirement

The `/analyseme` status renderer follows `specs/spec-configuration-tui-design-standard.md`:

- wide screens use a two-pane framed layout,
- narrow screens use a one-pane framed layout,
- tiny screens use a no-border fallback,
- selection marker is `▶ `,
- footer separator is ` • `,
- values are right-aligned,
- every rendered line fits terminal width.

## Validation

Run:

```bash
npm run validate
pi --no-extensions -e .
```

Use `pi --no-extensions -e .` for isolated smoke testing so other configured extensions do not interfere.
