# AnalyseMe Architecture

## System boundary

AnalyseMe is a TypeScript extension running inside Pi. The user can inspect local configuration with `/analyseme`; Pi can invoke five tools that read existing SonarQube/SonarCloud analysis and one tool that explicitly submits a new analysis. The read tools and the scanner do not share a transport:

```text
User → Pi /analyseme → local config files and environment → masked status in Pi
                         (help returns text without loading configuration)

Pi read tool → AnalyseMe config and scope → Node fetch → Sonar GET API
             ← mapped, bounded Pi result  ← JSON       ← stored analysis

Pi scan tool → AnalyseMe config and scope → local SonarScanner → upload to Sonar
             ← outcome, log tail and report metadata             Sonar → Compute Engine
```

Pi initiates each tool call. The read adapter initiates HTTP requests; the scan adapter starts a separate local process, and that process uploads the analysis. Sonar processes the uploaded report. AnalyseMe has no background scan or polling service and does not maintain its own result store.

## Startup and status

Pi loads `src/extension.ts` from [`package.json`](../package.json)'s `pi.extensions`. `analyseMeExtension` delegates to six tool registrars, `registerAnalyseMeCommand`, and `registerAnalyseMeLifecycle`. The factory only registers handlers; it does not check credentials, contact Sonar, or start the scanner. On `session_start` and `session_shutdown`, the lifecycle handler clears any stale AnalyseMe status when Pi has a UI. It does not set up background work.

`handleAnalyseMeCommand` sends text for `/analyseme help` without needing local configuration or a network connection. With no arguments, it loads configuration and resolves the local project key, then passes the results to `buildConfigTuiModel`. Status shows token presence in masked form and reports local configuration problems, including file-read warnings, rather than testing endpoint reachability or permissions. Pi's TUI mode opens `ConfigTuiComponent`; other modes render the same status as text. The view does not edit settings.

## Reading analysis

Follow `analyseme_get_issue` from `registerGetIssueTool` to `executeGetIssueTool`:

1. **Resolve context.** The adapter requires a non-empty `issueKey` and calls `resolveOptionalProjectToolContext`. `requireAnalyseMeConfig` validates `SONARQUBE_URL` and `SONARQUBE_TOKEN`; a non-empty process environment value takes precedence over the corresponding value parsed from the project directory's `.env`. HTTPS is required unless insecure HTTP is explicitly enabled. The project key comes from `projectKey`, then `SONARQUBE_PROJECT_KEY`, then `sonar.projectKey` in `sonar-project.properties`. `.git/config` is diagnostic only. The detail tools can work without a resolved project key; the summary, list and scan tools require one. Explicit `organization` overrides configured organization. Scope comes from the explicit branch or pull request, then configured scope, then GitHub Actions context, otherwise defaults to project scope. Branch and pull request are mutually exclusive; an invalid configured pair fails connection configuration even if a tool argument would otherwise take precedence.
2. **Fetch the finding.** `buildIssueDetailEndpoint` builds `/api/issues/search` with `issues` set to the requested key and `additionalFields=_all`. `HttpSonarClient.getJson` builds the request against the configured origin and uses Node `fetch` with GET and token-based Basic authentication. Each request defaults to a 30-second timeout and a 2 MiB response-body limit before JSON parsing. The client reports HTTP, network, timeout, oversized-body and parse failures; it redacts credentials from API error text and preserves caller cancellation. The adapter fails the detail call if the primary request fails or the response does not contain the requested issue.
3. **Enrich when available.** The adapter looks up the rule with `/api/rules/show` and requests `/api/sources/issue_snippets`. If the snippet request fails or yields no payload, it can try `/api/sources/show` around the primary line (three lines on either side, starting no earlier than line 1) when it has a component and line. Missing inputs or failed optional requests can leave a usable issue with warnings; caller aborts propagate instead of becoming warnings. `mapIssueDetail` shapes the location, flows, snippets and Sonar rule guidance without inventing remediation.
4. **Return a bounded result.** The mapper sanitizes and limits Sonar-derived text fields; the adapter redacts credentials from enrichment warnings. `truncateAnalyseMeText` applies Pi's line and byte limits to rendered `content` and adds a notice when the text is shortened. `details` carries mapped data, request metadata without auth headers, warnings and truncation metadata, not the raw HTTP response.

The summary adapter combines `/api/qualitygates/project_status` and `/api/measures/component`. The issue and hotspot list adapters each request one page, with a requested page size of at most 100. They filter returned rows for active issues or hotspots still requiring review, respectively, and flag missing arrays or malformed rows as partial data. Hotspots use `/api/hotspots/search` and `/api/hotspots/show`, not issue search or issue snippets. The hotspot detail adapter maps security guidance from the hotspot payload and can request a narrow `/api/sources/show` window for location context.

## Submitting analysis

1. **Prepare the invocation.** `registerRunScanTool` registers `analyseme_run_scan` as a sequential Pi tool. `executeRunScanTool` resolves connection, project key and scope with `resolveProjectToolContext`, validates extra `key=value` properties, and has `buildScannerArgs` append resolved project, organization and scope values where present. `buildScannerEnv` inherits the process environment and sets `SONAR_HOST_URL` and `SONAR_TOKEN`; AnalyseMe does not put the configured URL or token in the argument list. The reserved connection and credential properties are listed in the [scan decision](../docs/adr/0001-sonar-scan-boundary.md#decision).
2. **Run the local CLI.** `resolveScannerCommand` reads `SONARQUBE_SCANNER_PATH` from the process environment or defaults to `sonar-scanner` on `PATH`. `runScannerProcess` spawns it without a shell in Pi's current project directory and retains a tail of stdout and stderr. A missing executable produces install guidance, not an automatic install; other spawn failures throw. A timeout or abort attempts to stop the scanner (its process group on POSIX, with a direct-child fallback). The adapter reports timeout and exit or signal information when returning normally; it propagates caller cancellation. A nonzero exit is a failed scanner outcome, not an upload confirmation.
3. **Interpret the result.** `readScannerReportTask` reads `.scannerwork/report-task.txt`. After a zero exit, the adapter surfaces the parsed report and any dashboard or Compute Engine (CE) task link it contains. A missing or unreadable report produces a warning: scanner exit success alone does not confirm upload. The tool uses the file as evidence, not a separate server check. Without a quality-gate wait, the upload and server processing are separate: wait for the CE task to finish successfully before reading fresh results for that scope. `waitForQualityGate: true` adds `sonar.qualitygate.wait=true`, handing the wait to the scanner; a failed gate can produce a nonzero exit even if analysis was uploaded. AnalyseMe does not poll Sonar or read back findings as part of this call.
4. **Return a bounded result.** The adapter sanitizes the captured log, redacts the configured token and limits the returned tail. It returns truncated rendered `content` where necessary and structured `details` with the execution outcome, report metadata when available, log tail, warnings and truncation metadata.

## Boundaries and decisions

The read path trusts the configured Sonar endpoint with the API credential but treats returned messages, snippets and guidance as data, not instructions. The scan path also trusts the locally selected scanner: it runs with the caller's privileges, can read the project, inherits the process environment, and receives the resolved credential. Output redaction is not process isolation. A submitted analysis can change what Sonar reports next; AnalyseMe does not expose operations to edit individual findings. See the [scan decision](../docs/adr/0001-sonar-scan-boundary.md) for rationale and local side effects, and the [security policy](../SECURITY.md) for credential and data handling expectations.

See the [product brief](../docs/PROJECT_DEFINITION_BRIEF.md) for requirements and the [structure guide](../docs/STRUCTURE.md) for module locations and targeted checks. The [HTTP client tests](../test/sonar-client.test.mjs) use mocked responses; the [scan tool tests](../test/run-scan-tool.test.mjs) use a fake scanner. Neither requires a live Sonar server or proves a real upload.
