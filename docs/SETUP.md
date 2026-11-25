# Set up AnalyseMe

Install AnalyseMe in Pi, connect it to SonarQube or SonarCloud, and check which project it will use. For a first inspection, follow the [quick start](../README.md#quick-start). For tool inputs and results, see the [command and tool reference](TOOLS.md). [Documentation index](README.md)

## Install

Use [Pi](https://pi.dev/) with Node.js 22.19.0 or later. Choose how Pi should load AnalyseMe:

| Scope | Command | When to use it |
| --- | --- | --- |
| Global | `pi install npm:@senad-d/analyseme` | Make AnalyseMe available across projects. |
| Project-local | `pi install npm:@senad-d/analyseme -l` | Add it to the current project's `.pi/settings.json`; trust the project in Pi to load it. |
| One run | `pi -e npm:@senad-d/analyseme` | Try the package without adding it to settings. |
| Pinned Git source | `pi install git:github.com/senad-d/analyseme@TAG` | Replace `TAG` with a tag or commit to install that revision. |
| Local checkout | `pi --no-extensions -e .` | Run from the AnalyseMe checkout after `npm ci`, without loading other discovered extensions. See the [contributor guide in the repository](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md) for development setup. |

For an installed package, start `pi` in the project you want to inspect. The one-run command starts Pi directly; use it from that same project directory.

## Configure locally

Set the connection values in the environment before starting Pi, or in a `.env` file in the directory where Pi runs. For each setting, a nonblank environment value wins over `.env`; a blank value does not clear a file setting. AnalyseMe reads the file without sourcing it and does not write configuration files.

Example `.env` for SonarCloud (placeholders only, not a shell command):

```dotenv
SONARQUBE_URL="https://sonarcloud.io"
SONARQUBE_TOKEN="replace-with-local-token"
SONARQUBE_ORGANIZATION="your-organization"
SONARQUBE_PROJECT_KEY="your-project-key"
```

| Setting | What to supply |
| --- | --- |
| `SONARQUBE_URL` | Required for tools. Use the HTTPS base URL of your SonarQube or SonarCloud instance. |
| `SONARQUBE_TOKEN` | Required for tools. Use a token with access to the target project and analysis scope for reads. Scan submission needs a token authorized to execute analysis. Never put a real token in a prompt, commit, or shared log. |
| `SONARQUBE_ORGANIZATION` | Set the organization when required, typically on SonarCloud. |
| `SONARQUBE_PROJECT_KEY` | Optional default project key. See [project selection](#select-project-and-scope) for alternatives. |
| `SONARQUBE_BRANCH` or `SONARQUBE_PULL_REQUEST` | Optional branch name or PR key for a specific analysis. Set at most one. |
| `SONARQUBE_ALLOW_INSECURE_HTTP` | Set to `true` only for an intentional `http://` connection to a trusted local or development endpoint. Without TLS the token can be exposed on the network; `/analyseme` warns about this. |

If you explicitly want to [submit a scan](TOOLS.md#submitting-a-scan), make `sonar-scanner` available on `PATH` or set `SONARQUBE_SCANNER_PATH` in Pi's **process environment**, not in AnalyseMe's `.env`. Set it to the executable, not its parent directory or a command with arguments. For example, in the shell that will launch Pi (replace the path):

```bash
export SONARQUBE_SCANNER_PATH="/path/to/sonar-scanner"
```

Run `/analyseme` inside Pi to inspect local configuration and token presence without revealing the token. `/analyseme help` works even without configuration. Neither command queries Sonar; a successful status check does not verify the token, project, or freshness of analysis. See the [security policy](../SECURITY.md) before sharing tool output.

## Select project and scope

- **Project key:** The tool's `projectKey` wins, then `SONARQUBE_PROJECT_KEY`, then `sonar.projectKey` in `sonar-project.properties` in Pi's current directory. A Git remote is a diagnostic hint only, not a fallback project key.
- **Organization:** A tool's `organization` overrides `SONARQUBE_ORGANIZATION` for that call.
- **Analysis scope:** An explicit `branch` or `pullRequest` wins over a valid configured scope. Otherwise AnalyseMe uses `SONARQUBE_BRANCH` or `SONARQUBE_PULL_REQUEST`, then GitHub Actions context, then the default project scope (neither branch nor PR sent).

Set at most one of `branch` and `pullRequest` per tool call. Also check **both** the environment and `.env`: a branch in one and a PR in the other still conflict. Remove the unwanted setting from every source that supplies it; a call-level override does not fix a configuration that sets both.

## Use in CI

This GitHub Actions job fragment asks Pi to read an existing **branch** analysis without submitting a scan. It assumes Pi is already available on the runner and configured for noninteractive model access. Set Sonar credentials through Actions secrets and the project key through an Actions variable. Run only in a workflow that is trusted to receive those secrets.

```yaml
jobs:
  analyseme:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Read Sonar analysis with Pi
        env:
          SONARQUBE_URL: ${{ secrets.SONARQUBE_URL }}
          SONARQUBE_TOKEN: ${{ secrets.SONARQUBE_TOKEN }}
          SONARQUBE_ORGANIZATION: ${{ secrets.SONARQUBE_ORGANIZATION }}
          SONARQUBE_PROJECT_KEY: ${{ vars.SONARQUBE_PROJECT_KEY }}
          SONARQUBE_BRANCH: ${{ github.ref_name }}
        run: |
          pi --no-session -e npm:@senad-d/analyseme \
            -p "Use AnalyseMe to read the project summary and the first page of active issues (limit 10). Do not run a scan."
```

For PR analysis, remove the branch setting and set `SONARQUBE_PULL_REQUEST` to the PR number, or omit both settings and let AnalyseMe infer the scope. For inference, AnalyseMe tries the PR number from `GITHUB_EVENT_PATH` or a `refs/pull/…` value in `GITHUB_REF` first; branch fallback checks `GITHUB_HEAD_REF`, `GITHUB_REF_NAME`, then `refs/heads/…` in `GITHUB_REF`. Inspect the scope reported by the tool before interpreting results.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No URL, token, or project key | Use `/analyseme` to check local sources and masked token presence. Start Pi in the right directory. Supply the required connection settings and, for a project query, a resolvable project key. |
| Wrong project, organization, branch, or PR | Compare the scope and project reported by the tool with the [precedence rules](#select-project-and-scope). Clear conflicting settings and check the explicit tool inputs, not just `.env`. |
| URL rejected or an HTTP warning appears | Use the correct HTTPS base URL. Use the non-TLS opt-in only for trusted development. |
| HTTP 401 or 403 | Check that the token is valid for this server and can read the project and analysis scope. If the failure is from the scanner, check that its token can execute analysis. Do not paste the token into an error report. |
| No active issues or reviewable hotspots on this page | Check page number, server total, exclusions, and warnings before drawing a conclusion. A page with no matching rows is not proof that the whole project is clear. |
| Missing rows or shortened output | Check `details.partialData` for a missing list or malformed rows and `details.truncation` for shortened display text. Reduce `limit`, page through results, or fetch one finding by key. See [how to interpret results](TOOLS.md#common-inputs-and-results). |
| Scanner missing, won't start, or exits nonzero | Check `PATH` or the process-only `SONARQUBE_SCANNER_PATH` and executable permissions. If it starts but fails, inspect the exit result and sanitized log tail. AnalyseMe can suggest installation options; it does not install the scanner. |
| Scan exits successfully but results look stale | Check the upload confirmation and Compute Engine (CE) task, if reported. Wait for server processing before re-reading the same project and scope. See [scan results](TOOLS.md#submitting-a-scan) for missing reports and quality gate waits. |

## Update and uninstall

Update only AnalyseMe, or update all installed Pi extensions:

```bash
pi update npm:@senad-d/analyseme
pi update --extensions
```

Remove the package from the scope where you installed it. For a project-local install, run the second command from that project:

```bash
pi remove npm:@senad-d/analyseme
pi remove npm:@senad-d/analyseme -l
```

A one-run load did not add the package to settings, so there is no settings entry to remove.
