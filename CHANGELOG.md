# Changelog

All notable changes to AnalyseMe will be documented in this file.

## 0.1.0 - Unreleased

### Added

- Added safe configuration loading from environment variables and local `.env` with token masking and URL validation.
- Added project-key resolution from explicit tool input, `SONARQUBE_PROJECT_KEY`, and `sonar-project.properties`; `.git/config` remotes remain diagnostics only.
- Added branch/pull-request scope resolution from explicit input, env/`.env`, and GitHub Actions context.
- Added a read-only SonarQube/SonarCloud HTTP client using `fetch` with abort support and redacted errors.
- Added endpoint builders for project summary, issues, rules, source context, and security hotspot APIs.
- Added response mapping and truncation helpers for project summaries, issue details, and hotspot details.
- Added `analyseme_get_project_summary`.
- Added `analyseme_list_issues` with active issue filtering.
- Added `analyseme_get_issue` with source context where available and Sonar-provided rule guidance.
- Added `analyseme_list_security_hotspots`.
- Added `analyseme_get_security_hotspot` with source context where available and Sonar-provided security guidance.
- Added `/analyseme help` setup and usage output.
- Added `/analyseme` read-only configuration/status rendering with masked token presence.
- Added lightweight session status lifecycle hooks.

### Security

- Kept all Sonar interactions read-only.
- Redacted Sonar tokens from command output, tool output, details, and errors.
- Kept default validation offline with mocked Sonar API responses.

### Prepared

- Prepared the Pi extension project as `@senad-d/analyseme`.
- Added the approved project definition brief.
- Added architecture, guidelines, implementation task specs, and configuration TUI design standard.
- Removed template example runtime registrations.

### Documentation

- Added validation and smoke-test instructions for offline checks, isolated Pi loading, package contents, and optional live Sonar testing.
