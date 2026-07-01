# Security Policy

AnalyseMe is a prepared Pi extension project for read-only SonarQube/SonarCloud analysis retrieval. Runtime features are planned but not implemented yet.

## Supported versions

Security fixes will target the latest published version once the package is released. Until then, treat the repository as pre-release preparation work.

## Security model

Planned AnalyseMe behavior is intentionally read-only:

- It reads configuration from environment variables and optionally local `.env`.
- It sends read-only HTTP requests to the configured SonarQube/SonarCloud endpoint.
- It returns project summary, active issue lists, issue locations, security hotspot details, and Sonar rule/hotspot metadata to the Pi agent.
- It does not mutate Sonar issues, assignments, comments, project settings, or repositories.
- It does not send telemetry.

## Credentials

Planned configuration variables:

- `SONARQUBE_URL` — SonarQube/SonarCloud endpoint.
- `SONARQUBE_TOKEN` — API token.
- `SONARQUBE_ORGANIZATION` — optional SonarCloud organization.
- `SONARQUBE_PROJECT_KEY` — optional default project key; tools may also resolve `sonar.projectKey` from `sonar-project.properties`.
- `SONARQUBE_BRANCH` — optional branch analysis scope.
- `SONARQUBE_PULL_REQUEST` — optional pull request analysis scope; mutually exclusive with branch.

Implementation must never print, log, persist, or return the raw token in tool content, tool details, TUI output, errors, tests, or documentation examples. The planned `/analyseme` TUI is read-only and must show token presence only in masked form.

## Local files

`.env` is for local convenience only and is ignored by git. Runtime behavior must not write `.env` or other configuration files. Future tooling may read `.env`, `sonar-project.properties`, and GitHub Actions context variables to load configuration, but it must not expose raw file contents. `.git/config` may be inspected only for diagnostics/suggestions and must not be used as an automatic Sonar project key.

## Network access

Planned network access is limited to the configured SonarQube/SonarCloud URL. Implementation should use `fetch` with abort support and must not shell out to `curl` or other commands for API calls.

## Reporting a vulnerability

Open a private security advisory or contact the maintainer through the repository security process once the GitHub repository exists. Do not include real Sonar tokens, private source code, or sensitive scan data in public issues.

## For implementers

Before implementing runtime behavior, read:

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-tasks.md`

Do not weaken the read-only Sonar boundary without an explicit design decision.
