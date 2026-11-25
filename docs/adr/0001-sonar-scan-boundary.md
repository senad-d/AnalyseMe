# ADR 0001: Separate analysis submission from read-only retrieval

## Context

This record describes an existing boundary. The original tools read analysis already stored in SonarQube/SonarCloud. Reading that data after local changes cannot submit a report for those changes. The [Unreleased changelog](../../CHANGELOG.md#unreleased) records the addition of `analyseme_run_scan` to handle that separate operation.

## Decision

Keep all five retrieval tools on the GET-only path. Submit a new analysis only when Pi explicitly invokes `analyseme_run_scan`, which runs the local SonarScanner CLI against the configured SonarQube or SonarCloud service. There is no scan at startup or as a side effect of reading a finding. The upload provides fresh input for Sonar to process; it is not an API for changing an issue's or hotspot's status, assigning it, adding comments, or editing project settings. The distinction is visible in the [Pi registrations](../../src/extension.ts) and the [scan tool](../../src/tools/run-scan.ts).

Keep connection settings in AnalyseMe's resolved configuration. The adapter validates extra properties and rejects `sonar.host.url`, `sonar.token`, `sonar.login` and `sonar.password` from tool input. It passes the configured URL and token through the scanner environment instead of the argument list and redacts the configured token from the returned scanner log tail. This is a credential-handling boundary, not a sandbox for the scanner.

## Consequences

- Retrieval does not need a scanner or analysis-upload permission. Submission needs a trusted local scanner, an available Sonar service, and a token authorized to submit analysis for the target project.
- AnalyseMe does not edit `.env` or project configuration. The CLI runs in the project directory and can create or update local work files such as `.scannerwork/report-task.txt`. The [scanner wrapper](../../src/scan/scanner.ts) reads that path; it does not clean the work directory or verify that the report file belongs to this invocation. Treat report metadata as a way to locate the server task, not proof that the latest analysis was processed.
- A successful upload is not the same as fresh findings. The server processes the report asynchronously; read after successful processing for the same project and scope, or request the scanner's quality-gate wait. Stopping the local process does not establish that nothing was uploaded.

See [Submitting a scan](../TOOLS.md#submitting-a-scan) for usage and the [as-built architecture](../../specs/spec-architecture.md#submitting-analysis) for execution and failure handling.
