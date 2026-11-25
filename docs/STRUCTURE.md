# AnalyseMe Structure Guide

Use this map to find the source and checks for a change. For how the parts work together, see the [as-built architecture (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-architecture.md).

## Runtime map

| Path | Responsibility |
| --- | --- |
| [`src/extension.ts`](../src/extension.ts), [`src/constants.ts`](../src/constants.ts) | Pi entry point and shared names. The entry point delegates registration of the command, all six tools and lifecycle handlers. |
| [`src/commands/analyseme.ts`](../src/commands/analyseme.ts), [`src/ui/config-tui.ts`](../src/ui/config-tui.ts) | `/analyseme` status and text help. The UI module builds and renders the read-only status view. |
| [`src/events/lifecycle.ts`](../src/events/lifecycle.ts) | Clears stale AnalyseMe UI status at Pi session start and shutdown. |
| [`src/config/`](../src/config/) | Connection configuration and validation (`load-config.ts`), project key (`project-key.ts`), analysis scope (`analysis-scope.ts`), Git diagnostics (`git-diagnostics.ts`), file-read diagnostics and shared config types. |
| [`src/sonar/client.ts`](../src/sonar/client.ts), [`src/sonar/endpoints.ts`](../src/sonar/endpoints.ts) | GET transport and request limits; endpoint paths, query parameters and scope. |
| [`src/sonar/`](../src/sonar/) | `project-mapping.ts`, `issue-mapping.ts` and `hotspot-mapping.ts` shape their respective payloads. `location-mapping.ts` shares location, flow and snippet mapping. |
| [`src/tools/`](../src/tools/) | Pi schemas, orchestration and result rendering. `project-summary.ts` and the issue and hotspot list/detail adapters read existing analysis; `run-scan.ts` explicitly submits new analysis via the scanner. `shared.ts` resolves tool context and supplies request and rendering helpers. |
| [`src/scan/scanner.ts`](../src/scan/scanner.ts) | Scanner command resolution, argument validation and assembly, subprocess execution, log capture and report-task parsing. |
| [`src/utils/`](../src/utils/) | Cancellation (`abort.ts`), masking and redaction (`mask.ts`), Sonar text sanitizing and bounds (`text-safety.ts`), and rendered result truncation (`truncation.ts`). |

## Where to change what

| If you are changing… | Start here | Targeted checks (repository) |
| --- | --- | --- |
| Which source supplies a setting | [`load-config.ts`](../src/config/load-config.ts) for environment and `.env`; [`project-key.ts`](../src/config/project-key.ts) or [`analysis-scope.ts`](../src/config/analysis-scope.ts) for tool overrides and fallbacks. | [`config.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/config.test.mjs) |
| How a finding is retrieved or shaped | [`endpoints.ts`](../src/sonar/endpoints.ts) for requests. For issues use [`list-issues.ts`](../src/tools/list-issues.ts), [`get-issue.ts`](../src/tools/get-issue.ts) and [`issue-mapping.ts`](../src/sonar/issue-mapping.ts); for hotspots use [`list-security-hotspots.ts`](../src/tools/list-security-hotspots.ts), [`get-security-hotspot.ts`](../src/tools/get-security-hotspot.ts) and [`hotspot-mapping.ts`](../src/sonar/hotspot-mapping.ts). | [`sonar-endpoints.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/sonar-endpoints.test.mjs), [`sonar-mapping.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/sonar-mapping.test.mjs), and the corresponding list/detail tests in [`test/`](https://github.com/senad-d/analyseme/tree/main/test) |
| How GETs handle limits and errors | [`client.ts`](../src/sonar/client.ts) for authentication, abort, timeout, response-size limits and HTTP errors. | [`sonar-client.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/sonar-client.test.mjs) |
| How a local scan starts, stops or reports its outcome | [`run-scan.ts`](../src/tools/run-scan.ts) for tool inputs, scanner environment and output; [`scanner.ts`](../src/scan/scanner.ts) for process and report handling. | [`run-scan-tool.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/run-scan-tool.test.mjs) (scanner helpers and fake CLI runs) |
| What `/analyseme` displays | [`analyseme.ts`](../src/commands/analyseme.ts) for status/help dispatch; [`config-tui.ts`](../src/ui/config-tui.ts) for model, layout and interaction. | [`analyseme-command.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/analyseme-command.test.mjs), [`config-tui.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/config-tui.test.mjs) |
| What Pi sees at registration or session start/shutdown | [`extension.ts`](../src/extension.ts) and the owning registrar; [`lifecycle.ts`](../src/events/lifecycle.ts) for status cleanup. | [`public-surface-contract.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/public-surface-contract.test.mjs), [`lifecycle.test.mjs`](https://github.com/senad-d/analyseme/blob/main/test/lifecycle.test.mjs) |

## Repository support files

- [`package.json`](../package.json) declares the Pi entry point, npm scripts and package file allowlist. The [validation guide](VALIDATION.md) explains which checks to run and points to the repository scripts behind them.
- The [Sonar API fixtures (repository)](https://github.com/senad-d/analyseme/blob/main/test/fixtures/sonar-api/README.md) contain synthetic payloads used by compatibility tests. They are not evidence of a live-server run.
- The [documentation design (repository)](https://github.com/senad-d/analyseme/blob/main/docs/specs/analyseme-documentation.md) and [task plans (repository)](https://github.com/senad-d/analyseme/tree/main/docs/tasks) record work on the repository. Use the [Mission guide](MISSION.md) to distinguish current specifications, decisions and work records.
