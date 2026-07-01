# AnalyseMe

AnalyseMe is a prepared Pi extension project for read-only SonarQube and SonarCloud analysis tools.

> **Preparation status:** this repository has been prepared from the Pi extension template, but the planned commands and tools are **not implemented yet**. See `docs/PROJECT_DEFINITION_BRIEF.md` and the specs under `specs/` for the approved implementation plan.

## Planned purpose

AnalyseMe will help Pi agents retrieve relevant information from SonarQube/SonarCloud scans so they can understand and fix reported problems. The extension will use Sonar's REST API with a token and endpoint configured through environment variables or a local `.env` file.

Planned behavior is read-only:

- no Sonar issue transitions,
- no false-positive/accepted marking,
- no assignments or comments,
- no repository file edits,
- no telemetry.

## Planned Pi surfaces

| Surface | Name | Status | Purpose |
| --- | --- | --- | --- |
| Command | `/analyseme` | Planned | Read-only TUI showing configuration status and setup hints. |
| Command | `/analyseme help` | Planned | Text help for local and CI usage. |
| Tool | `analyseme_get_project_summary` | Planned | Fetch Sonar project summary/metrics for a `projectKey`. |
| Tool | `analyseme_list_issues` | Planned | List active issues, excluding ignored/false-positive/accepted-like results. |
| Tool | `analyseme_get_issue` | Planned | Fetch issue detail, location context, and Sonar rule guidance. |
| Tool | `analyseme_list_security_hotspots` | Planned | List security hotspots that require review. |
| Tool | `analyseme_get_security_hotspot` | Planned | Fetch security hotspot details and Sonar-provided security guidance. |

The `/analyseme` TUI must follow `specs/spec-configuration-tui-design-standard.md`.

## Planned configuration

Required:

```bash
SONARQUBE_URL="https://sonar.example.com"
SONARQUBE_TOKEN="your-token"
```

Optional:

```bash
# SonarCloud organization, when needed
SONARQUBE_ORGANIZATION="your-organization"

# Default project key for CI or repos without sonar-project.properties
SONARQUBE_PROJECT_KEY="your-project-key"

# Optional branch or pull request scope; set only one
SONARQUBE_BRANCH="main"
SONARQUBE_PULL_REQUEST="123"
```

Planned project key resolution order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`. `.git/config` remote names may be shown as diagnostics only and must not be used as automatic Sonar keys. Planned analysis scope resolution supports optional `branch` or `pullRequest`; they are mutually exclusive.

### Local `.env` example

```bash
SONARQUBE_URL="https://sonarcloud.io"
SONARQUBE_TOKEN="replace-with-local-token"
SONARQUBE_ORGANIZATION="your-organization"
SONARQUBE_PROJECT_KEY="your-project-key"
```

`.env` files are ignored by git and must not be committed.

### GitHub Actions example

```yaml
jobs:
  analyseme:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Pi with AnalyseMe
        env:
          SONARQUBE_URL: ${{ secrets.SONARQUBE_URL }}
          SONARQUBE_TOKEN: ${{ secrets.SONARQUBE_TOKEN }}
          SONARQUBE_ORGANIZATION: ${{ secrets.SONARQUBE_ORGANIZATION }}
          SONARQUBE_PROJECT_KEY: ${{ vars.SONARQUBE_PROJECT_KEY }}
          SONARQUBE_BRANCH: ${{ github.ref_name }}
        run: |
          pi --no-session -e npm:@senad-d/pi-analyseme \
            -p "Use AnalyseMe to inspect project <projectKey> and summarize active issues."
```

## Development

Install dependencies and run validation:

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
npm run pack:dry-run
pi --no-extensions -e .
```

Use isolated Pi loading for smoke tests:

```bash
pi --no-extensions -e .
```

Do not use `pi -e .` for validation unless you intentionally want other configured extensions loaded too.

## Project docs

- `docs/PROJECT_DEFINITION_BRIEF.md` — approved preparation brief.
- `docs/STRUCTURE.md` — intended repository layout and implementation boundaries.
- `specs/spec-architecture.md` — architecture plan.
- `specs/spec-guidelines.md` — implementation guidelines.
- `specs/spec-tasks.md` — future implementation task list for issues, security hotspots, commands, and validation; all checkboxes remain unchecked during preparation.
- `specs/spec-configuration-tui-design-standard.md` — required visual standard for the planned config TUI.

## Publishing plan

The package identity is prepared as `@senad-d/pi-analyseme` with repository URL `https://github.com/senad-d/pi-analyseme`.

Before publishing in a future session:

1. Implement and validate the planned behavior.
2. Update README/SECURITY/CHANGELOG from planned to implemented status.
3. Run `npm run validate`.
4. Run `npm publish --access public` from a clean working tree.

## Security

AnalyseMe will handle Sonar credentials and project analysis data. Read `SECURITY.md` before implementing, testing, or publishing.

## License

MIT
