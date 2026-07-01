# Contributing to AnalyseMe

AnalyseMe is a TypeScript Pi extension project for read-only SonarQube/SonarCloud analysis retrieval.

## Current status

The repository contains implemented read-only AnalyseMe runtime surfaces:

- `/analyseme` read-only configuration/status TUI and `/analyseme help`
- `analyseme_get_project_summary`
- `analyseme_list_issues`
- `analyseme_get_issue`
- `analyseme_list_security_hotspots`
- `analyseme_get_security_hotspot`
- lightweight `session_start`/`session_shutdown` status hooks

For design context and future work, start with:

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-tasks.md`
- `specs/spec-configuration-tui-design-standard.md`

Implement future work one checkbox at a time from current task specs in a separate implementation session.

## Requirements

- Node.js `>=22.19.0`
- npm
- Pi for smoke testing

## Development workflow

```bash
npm install
npm run validate
```

Useful commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run check:pack
pi --no-extensions -e .
```

## Pull request checklist

- Keep changes focused.
- Update README/docs when behavior changes.
- Add tests for implemented behavior.
- Do not commit secrets, `.env`, `.pi/`, `node_modules/`, generated reports, coverage, or package tarballs.
- Do not mark task checkboxes complete unless the task is actually implemented and validated.
- Keep Sonar API behavior read-only unless an explicit approved design decision changes that boundary.

## Security expectations

- Never print or log `SONARQUBE_TOKEN`.
- Keep the implemented `/analyseme` TUI read-only.
- Do not write `.env` from runtime code.
- Do not call Sonar mutation APIs.
- Do not use shell commands for Sonar HTTP requests.
