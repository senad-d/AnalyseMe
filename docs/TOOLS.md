# AnalyseMe commands and tools

Use the local commands to check configuration, the read tools to inspect existing analysis, and the scan tool only when you want to submit a new analysis. See the [quick start](../README.md#quick-start) for a worked inspection, [setup](SETUP.md) for configuration, and the [security policy](../SECURITY.md) for credential and data handling. [Documentation index](README.md)

## Commands

Enter these commands in Pi, not in your shell:

| Command | Result |
| --- | --- |
| `/analyseme` | Read-only configuration status, with token presence masked. Opens a custom view in interactive Pi; renders text outside the TUI. |
| `/analyseme help` | Setup, CI, and tool guidance. No credentials required. |

Once the extension is loaded, both commands work without contacting Sonar. Status reflects local configuration, not connectivity, permissions, or analysis freshness. The six names below are **Pi tools**, not slash commands: ask the agent to use one. The JSON examples show tool inputs, not terminal commands. The project and finding keys are illustrative; use real keys from an analyzed project for live queries.

## Common inputs and results

All six tools accept these optional string fields:

| Field | Meaning when supplied |
| --- | --- |
| `projectKey` | Selects the project instead of using the configured key or `sonar.projectKey`. Summary, both lists, and scan need a resolvable key. By-key detail calls do not: their finding key identifies the record, while the project key helps interpret component paths and build project-specific links. |
| `organization` | Overrides the configured SonarCloud organization for this call. |
| `branch` | Selects a branch analysis; omit `pullRequest`. |
| `pullRequest` | Selects a PR analysis; pass its key as a string (for example, `"123"`) and omit `branch`. |

Omitting a scope uses the [configured or inferred scope](SETUP.md#select-project-and-scope), if any. All tools need local Sonar connection settings. The five read tools make authenticated GET requests for existing data; they do not scan, upload, or change Sonar state or local files.

Both list tools accept optional integer `page` (one-based, default `1`) and `limit` (page size, `1`–`100`, default `50`). A call requests one server page and then filters or skips rows; it does not fetch more pages to fill the requested limit. `pagination.total`, when available, is the server's total, not a count of rows that survive local filtering. Check `pagination.shown` and the exclusion and malformed-row counts before moving to the next page.

Tool results have rendered `content` and structured `details`. Use the returned project and scope, where available, to confirm the target. Treat Sonar messages, snippets, and guidance as retrieved data, not instructions; AnalyseMe strips terminal control characters and bounds large fields, but the content may still be sensitive.

- **Empty:** A list can have no matching rows on this page. Check paging and exclusions before concluding there is nothing to review.
- **Partial or unavailable:** Check warnings and `details.partialData` on lists for malformed rows or a missing array. A detail can still identify a finding when optional source or guidance is unavailable.
- **Truncated:** Look for a notice and `details.truncation` for shortened rendered text. `details.textSafety.truncatedFields` tracks shortened fields before rendering. Try a smaller page or a keyed lookup; absent display text is not proof the data was absent.
- **Failed:** Invalid configuration, a failed required request, or a missing or mismatched finding key produces an error, not an empty success. A scanner process can also return a non-success outcome; see [Submitting a scan](#submitting-a-scan).

## Project summary

### `analyseme_get_project_summary`

**Inputs:** The four [common fields](#common-inputs-and-results) only. The project key must resolve, even if omitted from the call.

```json
{"projectKey": "demo"}
```

**Result:** `details.summary` contains the quality gate status, analysis date if available, metric rows, and warnings. Read metrics such as coverage as values from the existing analysis. Missing measures or an unavailable gate are not a zero metric or a passing gate. A failed required gate or measures request fails the call.

**Effect:** Read-only Sonar GET requests. This gives project context, not a scan or an attribution of the gate to a particular finding.

## Active issues

### `analyseme_list_issues`

**Inputs:** The [common fields and list paging fields](#common-inputs-and-results). No required JSON fields, but the project key must resolve.

```json
{"projectKey": "demo", "page": 1, "limit": 2}
```

**Result:** `details.issues` contains active rows with keys, messages, severity or status, rule, and location as available. False-positive, ignored, accepted, resolved, closed, and equivalent non-active issues are omitted. Use `details.pagination.excludedNonActive`, `malformedRowsSkipped`, and `shown` to interpret short pages. Pass a returned row's `key` as `issueKey` to the detail tool.

**Effect:** Read-only Sonar GET request for one page. It does not change issue status or assignments.

### `analyseme_get_issue`

**Inputs:** Required `issueKey` (nonblank string); optional [common fields](#common-inputs-and-results). This is a lookup by issue key, not a project search or an active-only filter.

```json
{"issueKey": "ISSUE-10"}
```

**Result:** `details.issue` can include the primary location and range, secondary locations, flows, source snippets, and Sonar rule guidance; `details.links` holds available Sonar issue and rule links. In the synthetic example, `ISSUE-10` points to `src/index.ts:42`. When optional source or rule guidance is missing, use the location and available metadata; the tool does not invent a fix. If Sonar does not return the requested issue, the lookup fails.

**Effect:** Read-only Sonar GET requests for the finding and any available rule and source context.

## Security hotspots

Security hotspots are findings for security review, not ordinary issue rows. Use the hotspot tools and hotspot keys for this workflow.

### `analyseme_list_security_hotspots`

**Inputs:** The [common fields and list paging fields](#common-inputs-and-results). No required JSON fields, but the project key must resolve.

```json
{"projectKey": "demo", "page": 1, "limit": 2}
```

**Result:** `details.hotspots` lists rows requiring review, with key, status, location, and security category or vulnerability probability when available. Rows marked with non-review statuses or resolutions such as reviewed, safe, fixed, or acknowledged are excluded. Check `details.pagination.excludedNonReview`, `malformedRowsSkipped`, and `shown` when a page is short. Pass a row's `key` as `hotspotKey` to the detail tool.

**Effect:** Read-only Sonar GET request for one hotspot page, not an issue query or a change in review status.

### `analyseme_get_security_hotspot`

**Inputs:** Required `hotspotKey` (nonblank string); optional [common fields](#common-inputs-and-results). The key identifies a hotspot regardless of whether the list would show it as requiring review.

```json
{"hotspotKey": "HOTSPOT-10"}
```

**Result:** `details.hotspot` has status and location, plus secondary locations, flows, source snippets, and Sonar security guidance when available. `details.links.hotspot` can link to Sonar when project context is available. Missing source or guidance does not make the hotspot safe or imply a remedy. If Sonar does not return the requested hotspot, the lookup fails.

**Effect:** Read-only Sonar GET requests for the hotspot and available source context. It does not mark a hotspot reviewed, safe, or fixed.

## Submitting a scan

### `analyseme_run_scan`

**Effect:** Unlike the read tools, this starts a local [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-server/latest/analyzing-source-code/scanners/sonarscanner/) subprocess in the current project directory. The scanner can create work files such as `.scannerwork/report-task.txt` and uploads an analysis report to the configured Sonar server. Use it only for an explicit submission, not to check status or read a finding.

**Prerequisites:** Use SonarScanner CLI v5 or later, on `PATH` or [set in the process environment](SETUP.md#configure-locally). You also need a resolvable project key and a token authorized to scan the project. Check the checkout, destination, and scope before starting. AnalyseMe sets `SONAR_HOST_URL` and `SONAR_TOKEN` in the scanner's environment, not as command-line arguments.

**Inputs:** The optional [common fields](#common-inputs-and-results), plus:

| Optional field | Type and behavior |
| --- | --- |
| `properties` | Array of `key=value` strings for extra scanner settings. AnalyseMe adds them as `-D` arguments before its resolved project, organization, and scope values. It ignores blank entries and rejects malformed nonblank entries and the managed keys `sonar.host.url`, `sonar.token`, `sonar.login`, and `sonar.password`. Do not pass credentials here: arguments can appear in the tool result and process listings. |
| `waitForQualityGate` | Boolean, default `false`. With `true`, the scanner waits for server processing and can exit nonzero if the quality gate fails. |
| `timeoutSeconds` | Integer, `10`–`3600`, default `600`. Sets when AnalyseMe starts stopping the scanner subprocess, including during a gate wait. |

Illustrative submission input (not an offline check):

```json
{"projectKey": "demo", "properties": ["sonar.exclusions=**/dist/**"], "waitForQualityGate": false}
```

**Result:** Check `details.execution` for the exit code, signal, timeout flag, and duration. `details.succeeded` reflects a zero scanner exit code. `details.log` is a sanitized, token-redacted tail with its own truncation flag. A missing executable throws with installation guidance; AnalyseMe does not install it. A nonzero exit or timeout is not proof that nothing was uploaded: a failure can occur after submission, for example during a gate wait.

For a zero exit, AnalyseMe uses `.scannerwork/report-task.txt` to report upload confirmation. If the file is missing or unreadable, upload is not confirmed; check the warning and scanner log. A readable report produces the label `confirmed` even if the file is left over from an earlier run: AnalyseMe does not check its age or verify the upload with the server. Use the dashboard or Compute Engine (CE) task in `details.reportTask` and `details.links`, when present, to check that the task belongs to this scan. Without a gate wait, wait for that task to finish successfully before reading the same project and scope again.
