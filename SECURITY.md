# Security policy

## Supported versions

Security fixes target the latest published version once the package is released. Until then, treat the repository as pre-release software.

## Security model

The `/analyseme` command shows help or read-only configuration status. The five retrieval tools read existing SonarQube or SonarCloud results. They do not change issue or hotspot state, assignments, comments, or project settings.

The optional `analyseme_run_scan` tool is the exception: when invoked, it runs a local SonarScanner CLI in the project directory to submit a new analysis to the configured Sonar server. This submission is not an issue or hotspot editing API. Only request a scan for code you are allowed to analyze and send to that server. Trust the Pi extension and the scanner executable you choose: the scanner runs with your local permissions and can access project files and its process environment. See the [scan boundary decision (repository)](https://github.com/senad-d/analyseme/blob/main/docs/adr/0001-sonar-scan-boundary.md) for the rationale.

## Credentials and local files

- The extension reads environment configuration and, when enabled, a local `.env`. It can read `sonar.projectKey` from `sonar-project.properties` and inspect `.git/config` for diagnostics and suggestions, not as an automatic source of the project key. It does not write those files. Keep local `.env` files out of version control.
- `/analyseme` masks token presence. Keep `SONARQUBE_TOKEN` out of prompts, tool arguments, docs, logs, and screenshots. See [setup](docs/SETUP.md#configure-locally) for configuring credentials.
- The extension passes the configured URL and token to the scanner in `SONAR_HOST_URL` and `SONAR_TOKEN`, not as command-line arguments. Tool input rejects scanner properties `sonar.host.url`, `sonar.token`, `sonar.login`, and `sonar.password`. Do not put other secrets in scanner properties or assume environment variables are hidden from the scanner.
- The scanner can create work files in the project directory. The extension looks for `.scannerwork/report-task.txt` there to report analysis task details. Do not assume running a scan leaves the working tree unchanged.

## Network and data handling

The retrieval client builds requests against the configured Sonar URL and uses Node `fetch` with GET and abort support, not shell commands. The configured URL must use HTTPS by default; opt in to HTTP only for a local or trusted development endpoint, because HTTP does not protect the token in transit. The extension does not send telemetry. The scanner is a separate process that performs the analysis upload.

Sonar messages, file paths, source snippets, rule and hotspot guidance, and scanner logs may contain sensitive project information. AnalyseMe strips terminal control sequences, bounds large text fields, and redacts the configured token from scanner log output. These safeguards do not make results public-safe: tool output and details are visible to the Pi agent and may be retained in Pi session history. Review them before sharing.

## Reporting a vulnerability

Open a private security advisory or contact the maintainer through the repository security process. Do not post real Sonar tokens, private source code, or sensitive scan data in public issues. Use sanitized examples when describing the problem.
