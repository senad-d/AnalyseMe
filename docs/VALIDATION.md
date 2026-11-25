# AnalyseMe validation and smoke testing

## Default validation

Start from a [prepared checkout (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md#prepare-a-checkout). From the repository root, run:

```bash
npm run validate
```

This is the same chain CI runs: type checking (`typecheck`), linting (`lint`), formatting (`format:check`), the test suite (`test`), a syntax check for the package guard (`check`), and the package contents check (`check:pack`). After dependency installation, it needs no live Sonar account, token, or scanner.

Sonar API tests use mocked responses. Scanner tests exercise a local fake executable and temporary files to check behavior such as argument handling, report parsing, and timeouts without submitting an analysis. The isolated Pi smoke test and the live read check below are not part of this chain.

## Package contents check

```bash
npm run check:pack
```

The guard inspects an npm package dry-run and fails on forbidden files, including environment files, local `.pi/` state, planning specs, dependencies, caches, generated reports, tarballs, and editor or OS artifacts. To inspect the file list as JSON without publishing, use:

```bash
npm run pack:dry-run
```

Check that the reader docs ship: `README.md`, `SECURITY.md`, `CHANGELOG.md`, and the top-level `docs/*.md` pages. Nested design, task, and decision records, root specs, `CONTRIBUTING.md`, tests, skill and agent instructions are repository-only. The manifest controls what ships; the guard does not check documentation links.

## Isolated Pi smoke test

```bash
npm run smoke:pi
```

The script loads the checkout in Pi without other configured extensions, in a temporary working directory, without a session. It runs `/analyseme help` and `/analyseme` in print mode with placeholder Sonar settings. It looks for setup text and the five retrieval tool names in help, checks status text including token presence, and fails if either command prints the placeholder token. It does not call any tools or require live Sonar access.

The [public-surface contract test (repository)](https://github.com/senad-d/analyseme/blob/main/test/public-surface-contract.test.mjs), included in default validation, imports the extension entry from the manifest and records registrations through a fake Pi API. It checks `/analyseme`, the lifecycle hooks, and all six tool registrations, including the scanner. It also checks expected schema fields and prompt guidance. The smoke script checks real Pi loading and command output, not the complete registry; neither check proves live connectivity.

## Targeted checks

For a manual interactive check, use the [isolated development start (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md#prepare-a-checkout). Enter `/analyseme`, navigate the sections and close the panel, then enter `/analyseme help`. Check that status is read-only, reports token presence without exposing its value, and that help shows setup guidance. Unlike print mode, interactive Pi opens a navigable panel.

The [TUI tests (repository)](https://github.com/senad-d/analyseme/blob/main/test/config-tui.test.mjs) check wide, narrow, and tiny rendering, line widths, selection, theme roles, and Pi keybindings. The panel adapts the [generic TUI standard (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-configuration-tui-design-standard.md) for read-only status: it omits editing, search, Tab pane switching, and save/cancel flows. Its footer describes sections, and its section headers count items rather than tracking an editable position.

For API response coverage, see the [synthetic Sonar fixture matrix (repository)](https://github.com/senad-d/analyseme/blob/main/test/fixtures/sonar-api/README.md). Its SonarQube and SonarCloud payloads cover response shapes, not compatibility with every live server or release. For specialized repository checks, see the [check registry](testing.md).

## Optional live Sonar smoke test

Only run this manually against a SonarQube or SonarCloud project you are authorized to inspect. [Configure the endpoint, token, and project locally](SETUP.md#configure-locally) and use the [isolated development start (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md#prepare-a-checkout). Check `/analyseme` before making requests; masked status shows configuration, not authentication success.

In Pi, ask the agent for a summary and a bounded list:

```text
Use analyseme_get_project_summary for the configured project.
Use analyseme_list_issues with limit 5 for the configured project.
```

Successful results show that these reads work for the configured server, credentials, and project. This is a GET-only check: do not request a scan or upload. Keep tokens out of prompts and logs, and do not share private findings or screenshots. See the [security policy](../SECURITY.md) before sharing evidence.
