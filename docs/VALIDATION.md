# AnalyseMe Validation and Smoke Testing

Default validation is offline and does not require live SonarQube/SonarCloud credentials.

## Default validation

Run from the repository root:

```bash
npm run validate
```

This runs:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test`
- `npm run check`
- `npm run check:pack`

The tests mock Sonar API responses. Do not add live Sonar credentials to default tests. CI runs the same `npm run validate` chain, so formatting regressions fail pull-request validation.

## Package contents check

Run:

```bash
npm run check:pack
```

The package dry-run must not include:

- `.env` or `.env.*`
- `.pi/`
- `specs/`
- local caches such as `.cache/`, `.local/`, `.trivycache/`
- generated reports or coverage
- build output
- npm tarballs (`*.tgz`)
- `node_modules/`

## Isolated Pi smoke test

Run the offline smoke script from the repository root:

```bash
npm run smoke:pi
```

The script runs Pi with isolated extension loading and a temporary working directory:

```bash
PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e <repo-root> --no-session -p "/analyseme help"
PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e <repo-root> --no-session -p "/analyseme"
```

Expected result:

- Pi loads the local AnalyseMe extension without other configured extensions.
- `/analyseme help` returns setup text and the five public tool names.
- `/analyseme` returns masked read-only configuration/status output.
- Placeholder Sonar values are used; no live Sonar credentials or network access are required.
- The placeholder token is not printed.

Pi does not currently expose a stable non-interactive CLI command for machine-readable tool registry discovery in this validation path. `test/public-surface-contract.test.mjs` loads `package.json` `pi.extensions`, imports the real exported extension factory, and uses a narrow fake `ExtensionAPI` to assert `/analyseme`, lifecycle hooks, and all five `analyseme_*` tool registrations with schemas and prompt guidance. The remaining follow-up is to replace or supplement this harness with a real Pi CLI/RPC registry inspection once Pi exposes one for smoke tests; `npm run smoke:pi` continues to verify the isolated Pi load path and command behavior.

## Configuration TUI conformance

`test/config-tui.test.mjs` covers wide, narrow, and tiny rendering, line-width safety, selected-row markers, semantic theme roles, and injected Pi keybinding navigation/close behavior. The `/analyseme` panel intentionally adapts the generic editable configuration TUI standard for a read-only status panel:

- it omits edit, search, Tab pane switching, and save/cancel flows;
- it keeps `↑↓ section  q quit` help text because keyboard input only changes the selected section or closes the panel;
- it uses category descriptions in the footer rather than editable-setting descriptions;
- it keeps header counters as item counts (`2 items`) instead of editable position counters (`1/2`).

These deviations are deliberate because `/analyseme` never writes configuration, repository files, Sonar state, or `.env`.

## Sonar API compatibility fixture matrix

The offline fixture matrix lives under `test/fixtures/sonar-api/` and is exercised by `test/sonar-compatibility-fixtures.test.mjs`.

- `sonarqube-10.6-core.json`: quality gate, measures, issue search/detail, rule `descriptionSections`, issue snippets, hotspot search/detail, source context, flows, secondary locations, and pagination.
- `sonarqube-9.9-fallbacks.json`: rule `htmlDesc`, `/api/sources/show` fallback, `textRange.startLine`, and colon-containing project keys.
- `sonarcloud-current-hotspots.json`: SonarCloud-style hotspot search/detail with top-level security guidance, source arrays, author/assignee metadata, flows, secondary locations, and pagination.

Known unsupported or unverified variants: live server compatibility across every SonarQube/SonarCloud release, private plugin-specific fields, deprecated mutation endpoints, and payloads that omit required issue or hotspot keys.

For an interactive smoke check, run:

```bash
PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e .
```

Then try:

```text
/analyseme
/analyseme help
```

Expected result:

- `/analyseme` shows read-only masked configuration/status output.
- `/analyseme help` shows setup guidance.
- No token value is printed.

## Optional live Sonar smoke test

Only run this manually when you intentionally want to test a real SonarQube/SonarCloud instance.

Set placeholders locally without printing secret values:

```bash
export SONARQUBE_URL="https://sonarcloud.io"
export SONARQUBE_TOKEN="replace-with-token"
export SONARQUBE_ORGANIZATION="your-organization"
export SONARQUBE_PROJECT_KEY="your-project-key"
```

Then start Pi in isolation:

```bash
PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 pi --no-extensions -e .
```

Ask the agent to use AnalyseMe tools, for example:

```text
Use analyseme_get_project_summary for the configured project.
Use analyseme_list_issues with limit 5 for the configured project.
Use analyseme_list_security_hotspots with limit 5 for the configured project.
```

Safety expectations:

- Tools only send GET requests to the configured Sonar URL.
- Tools never mutate issues, hotspot status, assignments, comments, or project settings.
- The raw `SONARQUBE_TOKEN` never appears in command output, tool output, details, logs, or screenshots.
- Large responses include truncation notices and metadata.
