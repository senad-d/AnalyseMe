# AnalyseMe Structure Guide

## Where AnalyseMe runs

AnalyseMe runs inside Pi, not as a standalone analysis server. Pi hosts the status command and tool handlers. The working directory supplies local configuration and the files a scanner can analyze. The configured analysis service holds previously submitted results; a separate local scanner process analyzes the working project and submits a new report only when asked.

| Operation | Where the data goes |
| --- | --- |
| Status | Local settings and project metadata → command handler → Pi status view or text. Nothing is sent to the analysis service. |
| Read | Tool inputs and resolved context → authenticated GET requests → analysis service. Selected fields from the responses → Pi tool result. |
| Scan | Resolved context and scanner options → local scanner in the working directory → report submission to the analysis service. Process output and available task metadata → Pi tool result. |

The [Product overview](PROJECT_DEFINITION_BRIEF.md) explains when to use each operation.

## Registration and lifetime

The `pi.extensions` entry in `package.json` loads `src/extension.ts`. Its `analyseMeExtension` function delegates to the registration functions for one slash command, five retrieval tools, one scan tool and two lifecycle hooks. Registration does not fetch results or start a scanner. Command and tool handlers do the work on demand.

The `session_start` and `session_shutdown` hooks in `src/events/lifecycle.ts` call `clearAnalyseMeStatus`. If Pi has a UI, that function clears the AnalyseMe status key. These hooks do not store configuration or schedule work.

## Local status path

1. **Route the command.** `handleAnalyseMeCommand` in `src/commands/analyseme.ts` handles `/analyseme help` before loading configuration. `/analyseme` without arguments enters the status path.
2. **Read local inputs.** `loadAnalyseMeConfig` in `src/config/load-config.ts` combines process settings and the optional `.env` in Pi's working directory. `resolveProjectKey` in `src/config/project-key.ts` can fall back to the local project properties file; Git remote names are diagnostic, not inferred project keys. The status handler tolerates local file read errors so it can show warnings and incomplete settings rather than stop at the first problem.
3. **Render the status.** `buildConfigTuiModel` in `src/ui/config-tui.ts` builds the display from local validation and the resolved default project key. It shows token presence, not the token. Pi hosts `ConfigTuiComponent` in interactive mode; its input handler navigates or closes the view, but does not save settings. Outside the TUI the command renders text, writing it to stdout in print mode or sending a displayed message without triggering an agent turn.

Ready is a local status, not a test of remote access. The view displays configured scope, not necessarily the effective scope of a later tool call: the tools also resolve per-call inputs and can fall back to detected execution context via `src/config/analysis-scope.ts`.

## Read path: look up an issue

1. **Resolve the call.** For `analyseme_get_issue`, `executeGetIssueTool` in `src/tools/get-issue.ts` checks for a nonblank issue key. `resolveOptionalProjectToolContext` in `src/tools/shared.ts` requires valid connection settings and resolves the organization and scope locally. A project key is useful for context and links but is not required for the keyed lookup.
2. **Fetch the record.** `buildIssueDetailEndpoint` in `src/sonar/endpoints.ts` builds a query for the issue key and any applicable organization and scope. The shared HTTP client sends a GET to the configured service. A failed primary request stops the lookup; a successful response without the requested key also fails, rather than returning a different issue or an empty detail.
3. **Add available context.** The handler requests rule metadata when the record includes a rule key. It tries issue snippets, and if that request yields no source payload it can request a small source window using the returned component and line. Both source reads are remote, not reads of the local checkout. Unavailable enrichment can produce warnings while preserving the issue; caller cancellation propagates instead of becoming a warning or triggering a fallback.
4. **Shape the result.** `mapIssueDetail` in `src/sonar/issue-mapping.ts` combines the record, rule metadata and available source. `src/sonar/location-mapping.ts` handles shared location, flow and snippet mapping. The handler builds links where possible and returns rendered text and structured details to Pi. It relays guidance from the service rather than generating a fix.

This lookup is independent of the summary and list calls. `src/tools/project-summary.ts` fetches gate status and measures for the project and combines them through `src/sonar/project-mapping.ts`. `src/tools/list-issues.ts` requests a page, filters non-active issues and maps the remaining rows. Hotspots have separate list and detail handlers in `src/tools/list-security-hotspots.ts` and `src/tools/get-security-hotspot.ts`: the list filters for findings needing review, while the detail reads one hotspot and may request source around its location. Both use `src/sonar/hotspot-mapping.ts`. Summary and list calls do not fetch source snippets, and keyed detail calls cannot guarantee that snippets are available.

## Submission path: run a scan

Only `analyseme_run_scan` starts the scanner; neither status nor retrieval invokes it.

1. **Prepare the process.** `executeRunScanTool` in `src/tools/run-scan.ts` requires a resolved project and validates extra scanner properties. `resolveScannerCommand` in `src/scan/scanner.ts` selects the executable from the process environment or uses the default executable name on `PATH`. AnalyseMe rejects extra properties for the connection and credentials. It passes the configured service URL and token in the child environment, not as command-line arguments.
2. **Run it locally.** `runScannerProcess` spawns the scanner in Pi's working directory without a shell. The child inherits the process environment with the connection settings supplied by AnalyseMe. The scanner, not the GET client, analyzes the project and submits the report. AnalyseMe does not install a missing scanner; it returns an error with installation guidance. The tool is not a source editor and does not directly change finding state or project settings, but the scanner can write local work files, including under `.scannerwork`.
3. **Handle completion.** A timeout or cancellation requests process termination. On POSIX the runner targets the scanner's process group, with direct-child fallback; on Windows it targets the direct child. A timeout is reported in the execution result; caller cancellation propagates as an abort. The handler uses the exit code for its success flag and reports process failures with execution details and a log tail. Without the optional quality-gate wait, an exit code of zero does not mean the service has finished processing the report; enabling the wait delegates that check to the scanner.
4. **Read submission metadata.** After the process finishes, `readScannerReportTask` looks for `.scannerwork/report-task.txt` in the working directory. On a successful exit, the tool returns available dashboard and processing-task links from that file, or warns if it cannot read the file. This is scanner-produced metadata, not a separate query of the server task.

## Data returned to Pi

- **Requests and errors.** `HttpSonarClient.getJson` in `src/sonar/client.ts` builds request URLs from service-relative paths and sends the token in a Basic authorization header. Connection validation requires HTTPS by default; an explicit HTTP opt-in warns that the token will travel without TLS. The client applies a per-request timeout and a response-body byte limit before JSON parsing. It distinguishes caller cancellation from request failures and maps HTTP, timeout and parsing failures to API errors. Error formatting and optional-read warnings redact the configured token.
- **Mapped fields and partial data.** Response mappers select application fields rather than passing through whole responses. List handlers distinguish filtered findings from malformed rows or missing result arrays. `src/utils/text-safety.ts` strips terminal escapes and unsafe control characters from mapped service text and bounds individual fields such as guidance. The scan runner keeps a tail of combined stdout and stderr; `buildRunScanLog` sanitizes it, redacts the configured token and applies a separate character limit.
- **Rendered versus structured output.** Handlers return text `content` alongside operation-specific `details`. `truncateAnalyseMeText` in `src/utils/truncation.ts` bounds the rendered text with Pi's line and byte limits and adds a notice and metadata when shortened. This is separate from field limits applied during mapping and from scanner-log truncation. A shortened display does not mean the structured result lost the same rows.

See [Public behavior](APPLICATION_SPEC.md) for inputs, status meanings and how to interpret results.
