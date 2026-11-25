# AnalyseMe Application Specification

AnalyseMe registers one Pi command for local help and status, five tools that read existing analysis, and one tool that explicitly submits a new analysis. Reading results does not start a scan or change findings, project settings, or repository files.

[Getting started](../README.md#quick-start) · [How AnalyseMe works](STRUCTURE.md)

## Command

| In Pi | Behavior |
| --- | --- |
| `/analyseme` | Reads local configuration and tries to resolve a default project key. Shows status, where settings came from, and any local diagnostics. The token is masked. |
| `/analyseme help` | Shows the exact connection, project, scope and scanner setting names, along with tool usage. Needs neither configuration nor a service request. Other nonempty arguments also show help, with an unknown-argument notice. |

| Status | Meaning | What to do |
| --- | --- | --- |
| **Ready** | Local configuration passes validation and a default project key was found. | Proceed to a read tool. This status does not verify service connectivity, authentication, permissions or scanner availability. |
| **Needs setup** | Required connection settings are missing or invalid, or the configured branch and pull request conflict. | Check the reported items and use `/analyseme help` for setting names. |
| **Needs project** | Connection settings pass local validation, but there is no default project key. | Set a default or pass `projectKey` when a tool needs one. Keyed detail lookups can run without a default project. |

In Pi’s interactive terminal, use ↑/↓ or `k`/`j` to switch sections and `q` or Esc to close. The view gets more compact in narrow terminals. It has no editor and saves no settings. Outside interactive mode, status is rendered as text (to standard output in print mode). Neither help nor status calls the analysis service.

## Project and scope

All six tools require a valid local connection configuration: a service URL and a nonblank access token. For connection, project defaults and scope settings, a nonblank process environment value takes precedence over the value in `.env` in Pi’s working directory. The URL must use HTTPS unless non-TLS HTTP is explicitly enabled; status warns when the URL uses HTTP, because the token travels without TLS. See `/analyseme help` for the exact setting names and the project properties file and key.

Every tool accepts these optional strings. Values are trimmed; blank strings are treated as omitted.

| Argument | Resolution when calling a tool |
| --- | --- |
| `projectKey` | Explicit argument, then the configured default, then the project key from the project properties file in Pi’s working directory. Git remote names are diagnostic only: they never supply the key. |
| `organization` | Explicit argument, then the configured organization, if any. |
| `branch` or `pullRequest` | One explicit scope, then one configured scope, then a scope detected from the execution context if available, otherwise the default project scope. Pass a pull request identifier as a string. |

`branch` and `pullRequest` are mutually exclusive. A valid explicit scope replaces the configured scope for that call; it cannot repair invalid local configuration, including a configuration that sets both scopes. Omitting both arguments allows the fallback order above; it does not force the default scope. The status screen shows configured scope, not the scope a particular tool call will resolve.

Summary, both lists and scan require a resolved project key. The two detail tools look up a finding by its own key, so resolved project context is optional. The project key helps interpret file paths and build project-specific finding links; it is not a second lookup key for a detail call.

## Read operations

All five reads accept the [shared project and scope arguments](#project-and-scope). For triage, read the summary, choose the issue or hotspot list, then use the key from that list for detail. If you already have a finding key, you can go straight to detail. A detail lookup does not apply the list’s activity or review filter.

| Tool | Additional inputs | Useful result in `details` |
| --- | --- | --- |
| `analyseme_get_project_summary` | None. | `summary`: quality gate status, analysis date and project metrics such as coverage, duplication and finding counts, when returned. Missing status or measures are not a passing gate or zero metrics. |
| `analyseme_list_issues` | Optional `page`, `limit` (see below). | `issues`: one page of active issue summaries, with keys, available severity or impact, status, rule and location. Excludes non-active signals such as false-positive, ignored, accepted, resolved or closed. |
| `analyseme_get_issue` | Required nonblank `issueKey` string. | `issue`: matching record with available locations, flows, source snippets, rule metadata and rule guidance. `links` can include issue and rule links. If the snippet request fails, the tool can try a source window around the reported line. |
| `analyseme_list_security_hotspots` | Optional `page`, `limit` (see below). | `hotspots`: one page of hotspot summaries that still need review, with keys, available review status, vulnerability probability, security category and location. Excludes reviewed, safe, fixed and acknowledged signals. |
| `analyseme_get_security_hotspot` | Required nonblank `hotspotKey` string. | `hotspot`: matching record with available locations, flows, source context and service-provided risk, vulnerability and fix guidance. `links` can include a project hotspot link. |

For either list, `page` is an integer starting at **1** (default **1**), and `limit` is an integer from **1 to 100** (default **50**). The tool requests one page, not a minimum number of matching results. `details.pagination` reports the page and page size and, when available, the service’s `total` before AnalyseMe’s per-page filtering. `shown` is the number of mapped rows in `details`, not the number visible after text truncation. `excludedNonActive` or `excludedNonReview` counts filtered rows; `malformedRowsSkipped` counts rows skipped during mapping. For issues, `activeReturned` is counted before mapping; for hotspots, `requiringReviewReturned` is counted after mapping.

## Submit a new analysis

`analyseme_run_scan` requires a [resolved project key and connection settings](#project-and-scope), a local scanner executable, and permission to submit analysis to the configured service. The scanner is picked from the process environment’s scanner-path setting (see `/analyseme help`) or found on `PATH`. AnalyseMe does not install it automatically.

The tool starts the scanner in Pi’s working directory and uses the configured connection to submit a new analysis. The scanner can create local work files. The tool does not edit source or configuration, assign or close findings, or mark hotspots reviewed. Reads never invoke it.

| Additional optional input | Type and default | Behavior |
| --- | --- | --- |
| `properties` | Array of `key=value` strings; no extras by default. | Passes extra properties to the scanner. Start each key with a letter and use only letters, digits, `.`, `_` or `-` before `=`. The connection URL, token, login and password properties are reserved and rejected; use the configured connection. AnalyseMe appends the project, organization and scope values it resolves after the extra properties. |
| `waitForQualityGate` | Boolean; `false`. | Set to `true` to ask the scanner to wait for the service to process the analysis and fail the scan if the quality gate fails. |
| `timeoutSeconds` | Integer from **10 to 3600**; **600**. | Time limit in seconds before AnalyseMe stops the scanner. This limits the local process, not any processing already started by the service. |

`details.succeeded` reflects scanner exit code zero. `details.execution` reports the exit code, signal, timeout flag and duration. `details.log` contains a bounded, sanitized log tail with the configured token redacted. The result distinguishes a timeout or nonzero exit from a launch error: a completed process produces a result even if it failed; invalid inputs or failure to start the scanner raise an error.

On a zero exit the tool reports scanner metadata from `.scannerwork/report-task.txt` if readable. `details.reportTask` and `details.links` can give the analysis dashboard and processing task; if the file is missing or unreadable, a warning accompanies the successful exit. When the scanner does not wait for the gate (the default), a successful exit does not mean the service has finished processing the analysis. Wait for the reported task to finish before treating a subsequent read as fresh.

## Interpreting results and failures

A returned tool result has human-readable text in `content` and operation-specific structured data in `details`. A tool error is not an empty result.

| What you see | How to interpret it |
| --- | --- |
| A page with no matching rows | The requested page may be empty or fully filtered. For example, `shown: 0` with `excludedNonActive: 5` means five rows on that page were filtered out, not that the project has no active issues. |
| Missing list data or malformed rows | `details.partialData` and warnings distinguish a missing results array or skipped rows from a valid empty page. Skipped rows are not counted as filtered-out findings. |
| A matching record with missing optional fields | A detail call can succeed without guidance, locations, source snippets or links. Failed optional rule or source requests can produce warnings without losing the matching record. Missing guidance does not mean a fix was found or generated. |
| Not found | A keyed read raises an error when the response does not contain the requested key, including when it returns a different key. |
| Configuration, permissions or service error | Invalid connection settings, an unreadable local settings file when needed, a missing required project or key, or a failure of a required request raise errors. Authentication or permission failures and other HTTP errors are distinct from network failures, request timeouts or invalid JSON. A failed required request for the summary does not return a partial summary. |
| Cancellation | Cancellation propagates instead of becoming a missing-data warning, even during optional detail requests. Cancelling a scan stops the local process and raises an abort rather than returning a completed scan result. |
| Truncation notice | `details.truncation` describes the line and byte limits applied to the rendered `content`; it does not remove rows from the structured result. Individual mapped fields can be shortened separately, with field notices and a count in `details.textSafety`. For scans, `details.log.truncated` refers to the scanner log tail, not the rendered result. |

## Terms

| Term | Meaning |
| --- | --- |
| **Current project** | The working repository from which Pi runs AnalyseMe. It is where AnalyseMe reads local configuration and starts a scan; the service project for a tool call is selected by project key. |
| **Project key** | The canonical identifier for a project in the analysis service. It need not match the repository name. |
| **Analysis scope** | The default project scope or one branch or pull request context. Branch and pull request scopes cannot be combined. |
| **Active issue** | A finding that still needs attention. The issue list treats rows as active unless their status, resolution or flags indicate otherwise. |
| **Security hotspot** | A finding for separate security review, not a normal issue or proof of a vulnerability. AnalyseMe can list and inspect hotspots but cannot record a review. |
| **Rule guidance** | Explanations, examples or remediation information retrieved from the analysis service. AnalyseMe surfaces available guidance; it does not generate a recommendation when the service supplies none. |
