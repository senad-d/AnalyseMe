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
- `npm run test`
- `npm run check`
- `npm run check:pack`

The tests mock Sonar API responses. Do not add live Sonar credentials to default tests.

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

Pi does not currently expose a stable non-interactive CLI command for machine-readable tool registry discovery in this validation path. Public surface registration remains guarded by fake-API unit tests for the five `analyseme_*` tools, `/analyseme`, and lifecycle status hooks; the smoke script verifies the isolated Pi load path and command behavior.

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
