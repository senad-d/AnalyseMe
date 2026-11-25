<p align="center">
  <img alt="AnalyseMe logo" src="https://raw.githubusercontent.com/senad-d/AnalyseMe/main/img/icon.png" width="128">
</p>

<p align="center">
  <a href="https://pi.dev"><img alt="pi package" src="https://img.shields.io/badge/pi-package-6f42c1?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@senad-d/analyseme"><img alt="npm" src="https://img.shields.io/npm/v/%40senad-d%2Fanalyseme?style=flat-square" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
  <a href="https://sonarcloud.io/summary/new_code?id=senad-d_AnalyseMe"><img alt="Quality Gate Status" src="https://sonarcloud.io/api/project_badges/measure?project=senad-d_AnalyseMe&metric=alert_status" /></a>
</p>

# AnalyseMe

AnalyseMe (`@senad-d/analyseme`) is a [Pi](https://pi.dev) extension for inspecting existing SonarQube and SonarCloud analysis from the terminal. Five read-only tools retrieve quality gates, metrics, active issues, and security hotspots, with source context and Sonar guidance where available. A separate, optional tool submits a new analysis.

[Start your first inspection](#quick-start) · [Browse the documentation](docs/README.md)

> **Security:** Pi packages run with your full system permissions. AnalyseMe reads local configuration and sends read requests to your configured Sonar URL. The optional `analyseme_run_scan` tool runs the local `sonar-scanner` CLI and uploads analysis to that server. See the [security policy](SECURITY.md).

## Quick Start

You’ll need Pi installed. To try the prompts, you’ll also need a working model in Pi and a Sonar token with read access to a project that already has analysis. You don’t need a scanner for this tutorial.

1. In your terminal, install AnalyseMe:

   ```bash
   pi install npm:@senad-d/analyseme
   ```

2. Follow [local configuration](docs/SETUP.md#configure-locally) to set your Sonar URL, token, and project key. Replace the setup placeholders with your own values and keep the token out of version control and Pi prompts.
3. In the project directory, start Pi:

   ```bash
   pi
   ```

4. In Pi, enter `/analyseme help` for help, then `/analyseme` for local configuration status. Check the project key and URL, and that the token is marked present without revealing its value. Press `Esc` to close the status panel. Neither command contacts Sonar: a present token does not prove it has access.

### Inspect a finding

The next three **Pi prompts** read existing data from your configured Sonar server. To follow along without a server, read the illustrative outcomes below instead of sending the prompts. They use a [synthetic fixture (repository)](https://github.com/senad-d/analyseme/blob/main/test/fixtures/sonar-api/sonarqube-10.6-core.json), not live data.

1. Get the summary for the configured project and analysis scope:

   ```text
   For this inspection, use only the named read tools. Don't edit files or run a scan.
   Use analyseme_get_project_summary. Show the project key, analysis scope, and quality gate status.
   ```

   In the fixture, project `demo` has gate status `ERROR`, with a failing coverage condition. Confirm the project and scope in your own result before listing issues.

2. Ask for one page of up to two rows in the same project and scope:

   ```text
   Use analyseme_list_issues with page 1 and limit 2. Keep the same project and scope. Show the active issue keys, pagination, and any warnings.
   ```

   The fixture’s first page shows `ISSUE-10` and omits an accepted issue. The server total is `3`, not a count of active issues. If no active issues are shown, you can stop without a key: that result applies only to this page. Check the page, page size, and server total (when available) for more pages, and check warnings and skipped-row counts for incomplete data.

3. Copy a key from your list into the next prompt in place of `<returned-issue-key>`:

   ```text
   Use analyseme_get_issue with issueKey <returned-issue-key> in the same project and scope. Show its primary location and any Sonar rule guidance.
   ```

   In the fixture, `ISSUE-10` points to **`src/index.ts:42`** with Sonar guidance to split the method and keep branches shallow. That tells you where to inspect the reported complexity, not why the coverage gate failed. The inspection ends at the reported location. These three tools change no files or findings and submit no scan.

## Demo

<table align="center">
  <tr>
    <th>AnalyseMe demo</th>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/senad-d/AnalyseMe/main/img/demo.gif" alt="AnalyseMe demo: inspect SonarQube and SonarCloud findings inside pi" title="AnalyseMe demo" width="760">
    </td>
  </tr>
</table>

## Next steps

### Installation

See [installation options](docs/SETUP.md#install).

### Configuration

See [local configuration](docs/SETUP.md#configure-locally) or [configuration in CI](docs/SETUP.md#use-in-ci).

### Commands and Tools

See the [command and tool reference](docs/TOOLS.md) for inputs, results, and the tools for security hotspots. Use [Submitting a scan](docs/TOOLS.md#submitting-a-scan) only when you intend to upload a new analysis.

### Troubleshooting

See [setup troubleshooting](docs/SETUP.md#troubleshooting) for configuration, connectivity, and scanner problems.

### Development and Validation

Start with the [contributor guide (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md) and the [validation guide](docs/VALIDATION.md).

### Update and Uninstall

See [Update and uninstall](docs/SETUP.md#update-and-uninstall).

### Publishing

See [Publishing in the contributor guide (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md#publishing).

## License

[MIT](LICENSE) © 2026 Senad Dizdarević.
