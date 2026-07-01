# AnalyseMe Structure Guide

AnalyseMe is prepared as a TypeScript Pi extension package. Runtime feature implementation is pending and must happen in a separate implementation session using the specs under `specs/`.

## Current preparation state

```text
src/
├── extension.ts   # inert prepared entry point; future register* calls go here
└── constants.ts   # project identity, command/tool names, env var names
```

The template example command/tool modules were removed so the prepared package does not expose unrelated runtime behavior.

## Planned file layout

```text
src/
├── extension.ts          # only imports modules and registers implemented features
├── constants.ts          # shared names and env var constants
├── commands/             # planned /analyseme command and /analyseme help
├── config/               # planned env/.env and sonar-project.properties loading
├── sonar/                # planned SonarQube/SonarCloud API client and mappers
├── tools/                # planned analyseme_* tool registrations
├── ui/                   # planned read-only config TUI renderer
└── utils/                # planned masking, truncation, formatting helpers
```

## Planned Pi surfaces

- `/analyseme` — read-only configuration/status TUI.
- `/analyseme help` — setup and tool usage tips.
- `analyseme_get_project_summary` — read project summary/metrics.
- `analyseme_list_issues` — list active issues only.
- `analyseme_get_issue` — retrieve issue location and Sonar rule guidance.
- `analyseme_list_security_hotspots` — list security hotspots requiring review.
- `analyseme_get_security_hotspot` — retrieve hotspot details and Sonar-provided security guidance.

## Implementation boundaries

- Keep `src/extension.ts` small. It should import feature modules and call their `register*` functions.
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

The planned `/analyseme` TUI must follow `specs/spec-configuration-tui-design-standard.md`:

- wide screens use a two-pane framed layout,
- narrow screens use a one-pane framed layout,
- tiny screens use a no-border fallback,
- selection marker is `▶ `,
- footer separator is ` • `,
- values are right-aligned,
- every rendered line fits terminal width.

## Validation

Preparation and future implementation should pass:

```bash
npm run validate
pi --no-extensions -e .
```

Use `pi --no-extensions -e .` for isolated smoke testing so other configured extensions do not interfere.
