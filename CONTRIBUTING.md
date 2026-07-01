# Contributing to AnalyseMe

AnalyseMe is a TypeScript Pi extension project for read-only SonarQube/SonarCloud analysis retrieval.

## Current status

The repository is prepared for implementation. Runtime commands/tools are intentionally pending. Start with:

- `docs/PROJECT_DEFINITION_BRIEF.md`
- `specs/spec-architecture.md`
- `specs/spec-guidelines.md`
- `specs/spec-tasks.md`
- `specs/spec-configuration-tui-design-standard.md`

Implement future work one checkbox at a time from `specs/spec-tasks.md` in a separate implementation session.

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
- Keep the planned `/analyseme` TUI read-only.
- Do not write `.env` from runtime code.
- Do not call Sonar mutation APIs.
- Do not use shell commands for Sonar HTTP requests.
