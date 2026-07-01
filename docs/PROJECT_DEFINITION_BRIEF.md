# Project Definition Brief

## 1. Bootstrap
- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/pi-analyseme`
- Copy status: copied template into current directory; preserved existing `.pi/agent/guardme-settings.json`

## 2. Project identity
- Package name: `@senad-d/pi-analyseme`
- Display name: `AnalyseMe`
- Exported extension function: `analyseMeExtension`
- Repository URL: `https://github.com/senad-d/pi-analyseme`
- One-sentence pitch: AnalyseMe gives Pi agents read-only SonarQube/SonarCloud analysis tools so they can inspect project health, active issues, issue locations, and rule-provided fix guidance.

## 3. Users and use cases
- Primary users: developers and coding agents working from local repositories or CI/GitHub Actions.
- Primary use cases:
  - Check SonarQube/SonarCloud project summary.
  - List all active, unresolved issues for a project.
  - Fetch one specific issue with "Where is the issue?" style location details.
  - List and inspect security hotspots that require review.
  - Fetch fix/security guidance only from Sonar rule/hotspot metadata APIs.
  - Verify local/CI configuration without exposing secrets.
- Non-goals:
  - No issue mutations, assignments, transitions, false-positive marking, comments, or writes to Sonar.
  - No code fixing in this extension; agents use the returned data with normal Pi tools.
  - No telemetry.

## 4. Pi integration surface

| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/analyseme` | Open read-only config/status TUI | Must follow `specs/spec-configuration-tui-design-standard.md` |
| Command | `/analyseme help` | Show setup/tool usage tips | Text help only |
| Tool | `analyseme_get_project_summary` | Fetch project quality/metric summary | `projectKey` optional; supports optional branch/PR scope |
| Tool | `analyseme_list_issues` | List active unresolved issues | `projectKey` optional; excludes ignored/false-positive/accepted-like statuses; supports optional branch/PR scope |
| Tool | `analyseme_get_issue` | Fetch detailed issue/rule/location info | Include rule metadata fix guidance from Sonar APIs only; supports optional branch/PR scope where needed |
| Tool | `analyseme_list_security_hotspots` | List security hotspots | Security hotspots are separate from issues and use read-only hotspot APIs |
| Tool | `analyseme_get_security_hotspot` | Fetch security hotspot details | Include Sonar-provided hotspot/security guidance only |
| Event | `session_start/session_shutdown` | Set/clear lightweight “AnalyseMe loaded” status | No background work |
| UI | Read-only config TUI | Show masked config, CI/local setup tips, status | No `.env` writes |
| Resource | none | No skills/prompts/themes planned | Specs/docs only |

## 5. Architecture
- Runtime files:
  - `src/extension.ts` — small entry point only.
  - `src/constants.ts` — names, status key, command/tool names, and env var names.
  - `src/config/` — read env, local `.env`, `sonar-project.properties`, and branch/PR scope.
  - `src/sonar/` — Sonar API client and response shaping.
  - `src/tools/` — one file per AnalyseMe tool plus shared tool helpers.
  - `src/commands/` — `/analyseme` command and help.
  - `src/ui/` — read-only config TUI design helpers.
  - `src/utils/` — truncation, masking, formatting helpers.
- Module boundaries:
  - Config loading separate from Sonar API calls.
  - Tools call service/client modules, not raw fetch directly.
  - TUI is config/status only, not a feature implementation shortcut.
- Dependencies:
  - Pi packages remain peer dependencies with `"*"`.
  - Runtime `.env` support can use a small dependency or a tested local parser in the implementation session.
  - Use Node fetch for HTTP.

## 6. Config, state, and persistence
- Config source:
  - Environment variables.
  - Local `.env` for local use.
  - Required: `SONARQUBE_URL`, `SONARQUBE_TOKEN`.
  - Optional: `SONARQUBE_ORGANIZATION` for SonarCloud.
  - Optional: `SONARQUBE_PROJECT_KEY` as an explicit default project key for CI or repositories without `sonar-project.properties`.
  - Optional branch/PR scope: `SONARQUBE_BRANCH` or `SONARQUBE_PULL_REQUEST`; never both.
- Session state: none required beyond normal tool result details.
- Files written: none by runtime tools/commands.
- Cleanup behavior: clear AnalyseMe status on `session_shutdown`.

## 7. Security and privacy
- Shell execution: none for Sonar HTTP requests.
- File access/mutation: read `.env` only if present; no file writes.
- Network access: read-only HTTP requests to configured SonarQube/SonarCloud endpoint.
- Credentials/secrets: token never returned in tool output; TUI masks token presence/value.
- Telemetry/retention: none.
- User confirmations: not needed for read-only tools; TUI explicitly says no writes.

## 8. Documentation and packaging
- README documents AnalyseMe setup, local `.env`, GitHub Actions examples, implemented commands/tools, troubleshooting, and validation.
- SECURITY documents Sonar token handling, network behavior, no telemetry, no Sonar writes, and safe text handling.
- CHANGELOG records prepared-project history and implemented runtime behavior.
- package.json changes:
  - Rename to `@senad-d/pi-analyseme`.
  - Update description/repository/bugs/homepage/keywords.
  - Keep `pi.extensions: ["./src/extension.ts"]`.
  - Keep runtime dependencies minimal; config loading currently uses tested local parsing.
- npm/git distribution plan: npm package and GitHub repo at `senad-d/pi-analyseme`.

## 9. Validation plan
- Typecheck: `npm run typecheck`
- Tests: metadata/spec presence, config, command/TUI, Sonar mapping/client, and tool behavior tests.
- Package dry-run: `npm run check:pack`
- Full validation after prep: `npm install`, then `npm run validate`
- Isolated Pi smoke test: `pi --no-extensions -e .`

## 10. Open questions and assumptions
- Questions:
  - None blocking.
- Assumptions:
  - `projectKey` is optional in tools and resolved in this order: explicit tool argument, `SONARQUBE_PROJECT_KEY`, `sonar-project.properties` `sonar.projectKey`. `.git/config` remote names may be shown as diagnostics only and must not be used as an automatic Sonar key.
  - Branch/PR scope is optional and resolved in this order: explicit tool argument, env/`.env`, then GitHub Actions context (`GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, `GITHUB_REF`, `GITHUB_EVENT_PATH`). `branch` and `pullRequest` are mutually exclusive.
  - `SONARQUBE_ORGANIZATION` is optional and used when SonarCloud requires it.
  - `/analyseme` TUI is read-only and never writes `.env`.
  - The TUI design must follow `specs/spec-configuration-tui-design-standard.md`.
- Decisions:
  - Tools are read-only.
  - Fix guidance comes only from Sonar rule metadata/API.
  - Active issues exclude ignored, false positive, accepted/resolved-like results.
  - Security hotspots are separate from issues and use dedicated read-only tools.
