# Security Policy

AnalyseMe is a read-only Pi extension for SonarQube/SonarCloud analysis retrieval.

## Supported versions

Security fixes target the latest published version once the package is released. Until then, treat the repository as pre-release software.

## Security model

AnalyseMe behavior is intentionally read-only:

- It reads configuration from environment variables and optionally local `.env`.
- It sends read-only HTTP requests to the configured SonarQube/SonarCloud endpoint.
- It returns project summary, active issue lists, issue locations, source snippets where available, security hotspot details, and Sonar rule/hotspot metadata to the Pi agent.
- It does not mutate Sonar issues, hotspot status, assignments, comments, project settings, or repositories.
- It does not send telemetry.

## Credentials

Configuration variables:

- `SONARQUBE_URL` — SonarQube/SonarCloud endpoint.
- `SONARQUBE_TOKEN` — API token.
- `SONARQUBE_ORGANIZATION` — optional SonarCloud organization.
- `SONARQUBE_PROJECT_KEY` — optional default project key; tools may also resolve `sonar.projectKey` from `sonar-project.properties`.
- `SONARQUBE_BRANCH` — optional branch analysis scope.
- `SONARQUBE_PULL_REQUEST` — optional pull request analysis scope; mutually exclusive with branch.

AnalyseMe must never print, log, persist, or return the raw token in tool content, tool details, TUI output, errors, tests, or documentation examples. `/analyseme` shows token presence only in masked form.

## Local files

`.env` is for local convenience only and is ignored by git. AnalyseMe reads `.env`, `sonar-project.properties`, and GitHub Actions context variables when needed, but it does not write `.env` or other configuration files. `.git/config` may be inspected only for diagnostics/suggestions and is not used as an automatic Sonar project key.

## Network access

Network access is limited to the configured SonarQube/SonarCloud URL. AnalyseMe uses Node `fetch` with abort support and does not shell out to `curl` or other commands for API calls.

Default tests use mocked `fetch`; live Sonar credentials are not required for validation.

## Data handling

Sonar issue messages, hotspot messages, file paths, source snippets, and rule metadata may contain project-sensitive information. AnalyseMe returns them only through normal Pi command/tool output and does not persist retrieved Sonar data outside normal Pi session/tool result storage.

## Reporting a vulnerability

Open a private security advisory or contact the maintainer through the repository security process. Do not include real Sonar tokens, private source code, or sensitive scan data in public issues.

## For implementers

Before changing runtime behavior, read:

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-tasks.md`

Do not weaken the read-only Sonar boundary without an explicit design decision.
