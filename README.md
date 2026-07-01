# AnalyseMe

AnalyseMe is a Pi extension package that gives agents read-only SonarQube and SonarCloud analysis tools.

It helps agents inspect project health, active issues, issue locations, Sonar rule guidance, and security hotspots without browser access or Sonar write permissions.

## Implemented Pi surfaces

| Surface | Name | Purpose |
| --- | --- | --- |
| Command | `/analyseme` | Show read-only configuration/status output with masked secrets. |
| Command | `/analyseme help` | Show setup, CI, and tool usage guidance. |
| Tool | `analyseme_get_project_summary` | Fetch Sonar project quality gate and summary metrics. |
| Tool | `analyseme_list_issues` | List active actionable issues, excluding ignored/false-positive/accepted/resolved-like results. |
| Tool | `analyseme_get_issue` | Fetch issue detail, location context, source snippets where available, and Sonar-provided rule guidance. |
| Tool | `analyseme_list_security_hotspots` | List security hotspots that require review. |
| Tool | `analyseme_get_security_hotspot` | Fetch security hotspot details, source context where available, and Sonar-provided security guidance. |

All tools are read-only. AnalyseMe never mutates Sonar issues, hotspot status, assignments, comments, project configuration, repository files, or `.env`.

## Configuration

Required:

```bash
SONARQUBE_URL="https://sonar.example.com"
SONARQUBE_TOKEN="replace-with-token"
```

`SONARQUBE_URL` must use HTTPS by default. For local or otherwise trusted development-only Sonar endpoints that only support `http://`, set `SONARQUBE_ALLOW_INSECURE_HTTP="true"` explicitly; `/analyseme` will show a non-TLS warning and tokens may be exposed on the network.

Optional:

```bash
# SonarCloud organization, when needed
SONARQUBE_ORGANIZATION="your-organization"

# Default project key for CI or repos without sonar-project.properties
SONARQUBE_PROJECT_KEY="your-project-key"

# Optional branch or pull request scope; set only one
SONARQUBE_BRANCH="main"
SONARQUBE_PULL_REQUEST="123"

# Explicit opt-in only for local/trusted non-TLS HTTP Sonar endpoints
SONARQUBE_ALLOW_INSECURE_HTTP="true"
```

Project key resolution order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, then `sonar-project.properties` `sonar.projectKey`. `.git/config` remote names are diagnostics only and are not used as automatic Sonar keys.

Analysis scope resolution order: explicit tool argument, `SONARQUBE_BRANCH`/`SONARQUBE_PULL_REQUEST`, then GitHub Actions context (`GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GITHUB_REF`, `GITHUB_EVENT_PATH`). Branch and pull request scope are mutually exclusive.

### Local `.env` example

```bash
SONARQUBE_URL="https://sonarcloud.io"
SONARQUBE_TOKEN="replace-with-local-token"
SONARQUBE_ORGANIZATION="your-organization"
SONARQUBE_PROJECT_KEY="your-project-key"
```

`.env` files are ignored by git and must not be committed. `/analyseme` reads status only and never writes `.env`.

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
            -p "Use AnalyseMe to inspect the project summary and active issues."
```

## Commands

```text
/analyseme
/analyseme help
```

- `/analyseme` renders a read-only configuration/status panel. It masks token presence, shows local `.env` status, and does not contact Sonar.
- `/analyseme help` shows configuration variables, local and GitHub Actions snippets, tool names, and read-only guarantees. It does not require credentials or network access.

## Tool usage overview

- Use `analyseme_get_project_summary` first to inspect quality gate and core metrics.
- Use `analyseme_list_issues` to retrieve active actionable issue rows. Use `page` and `limit` for pagination.
- Use `analyseme_get_issue` for a specific issue key when exact location, source snippets, secondary locations, flows, and Sonar rule guidance are needed.
- Use `analyseme_list_security_hotspots` for hotspots that require review.
- Use `analyseme_get_security_hotspot` for a specific hotspot key when exact location and Sonar-provided security guidance are needed.

Tool output is truncated when large and includes visible truncation notices plus structured metadata in `details`. Rule and hotspot guidance comes only from Sonar API responses; AnalyseMe does not invent remediation advice.

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

- `docs/PROJECT_DEFINITION_BRIEF.md` — original preparation brief.
- `docs/STRUCTURE.md` — repository layout and implementation boundaries.
- `docs/VALIDATION.md` — default validation, isolated Pi smoke checks, and optional live Sonar smoke testing.
- `specs/spec-architecture.md` — architecture plan.
- `specs/spec-guidelines.md` — implementation guidelines.
- `specs/spec-tasks.md` — implementation task list and progress.
- `specs/spec-configuration-tui-design-standard.md` — visual standard used by `/analyseme` status rendering.

## Publishing

Before publishing:

1. Run `npm run validate`.
2. Follow `docs/VALIDATION.md` for isolated Pi and optional live Sonar smoke checks.
3. Verify no `.env`, `.pi`, specs, caches, reports, coverage, build output, or tarballs are packaged.
4. Publish from a clean working tree with `npm publish --access public`.

## Security

AnalyseMe handles Sonar credentials and project analysis data. Read `SECURITY.md` before installing, testing, or publishing.

## License

MIT
