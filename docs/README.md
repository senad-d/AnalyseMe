# AnalyseMe documentation

Choose a path based on what you want to do with AnalyseMe.

## Use AnalyseMe

- [Inspect your first finding](../README.md#quick-start): install AnalyseMe, check local status, and follow an issue key to its location in the code.
- [Choose an installation](SETUP.md#install), [configure it locally](SETUP.md#configure-locally) or [in CI](SETUP.md#use-in-ci), [diagnose a problem](SETUP.md#troubleshooting), or [update or uninstall](SETUP.md#update-and-uninstall).
- [Look up a command or tool](TOOLS.md): check inputs, outputs, and limits for issue and hotspot inspections. See [Submitting a scan](TOOLS.md#submitting-a-scan) if you intend to upload an analysis.
- [Read the security policy](../SECURITY.md) for permissions, credentials, and private reporting. See the [changelog](../CHANGELOG.md) for release and unreleased changes.

## Contribute

- [Prepare a change and open a pull request (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md), or follow the [publishing procedure (repository)](https://github.com/senad-d/analyseme/blob/main/CONTRIBUTING.md#publishing) if you maintain releases.
- [Find the code to change](STRUCTURE.md), then [validate locally](VALIDATION.md). The [check registry](testing.md) tracks specialized checks, and the [fixture matrix (repository)](https://github.com/senad-d/analyseme/blob/main/test/fixtures/sonar-api/README.md) records what the synthetic compatibility tests cover.
- [Look up project terms (repository)](https://github.com/senad-d/analyseme/blob/main/CONTEXT.md), such as active issue and analysis scope.

## Specifications and Mission

- [Product specification](PROJECT_DEFINITION_BRIEF.md): what AnalyseMe does and the boundaries it preserves.
- [Implementation guidelines (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-guidelines.md) and the [generic configuration TUI design standard (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-configuration-tui-design-standard.md): engineering constraints and the design reference for the status panel.
- [Architecture (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-architecture.md): how configuration, Sonar reads, scanner execution, and output fit together. See the [scan boundary decision (repository)](https://github.com/senad-d/analyseme/blob/main/docs/adr/0001-sonar-scan-boundary.md) for why submission is separate from inspection.
- [Mission guide](MISSION.md): find current designs, plans, and verification records, and distinguish them from the retained backlog and historical reviews.
