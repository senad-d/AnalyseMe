# What AnalyseMe does

AnalyseMe (`@senad-d/analyseme`) is a Pi extension for developers and their coding agents. It brings existing results from a configured analysis service into Pi, so you can check an analyzed project's health and investigate a specific finding without leaving your coding session.

## From project health to one finding

Start with `analyseme_get_project_summary` to see the project's quality gate and available metrics. The summary shows how the project is doing for the selected analysis scope: the default scope, a branch, or a pull request.

- **Active issues** are findings that still need action. Use the issue list to pick one to investigate, then open it by key to see where it was reported and why the rule flagged it, if guidance is available.
- **Security hotspots** identify code that needs a security review. They have their own list and detail view, separate from active issues. Open one by key to see the reported location and any available security guidance.

Depending on what the service returns, a detail view can include source snippets, related locations, flows through the code, and guidance from the service. AnalyseMe reports that context; it doesn't diagnose the code independently or generate a patch.

## Boundaries

- Looking up results doesn't edit source or settings, change finding status, or record a hotspot review.
- The local status view reports configuration without editing it or testing access to the service.
- Submitting a new analysis is separate from reading results. Only the explicit scan tool runs a local scanner and submits analysis to the configured service. Opening a summary or finding doesn't start a scan.

## Where to go next

- [Getting started](../README.md#quick-start) — load AnalyseMe in Pi and inspect a finding.
- [Application specification](APPLICATION_SPEC.md) — look up commands, tool inputs and results, and failure behavior.
- [How AnalyseMe works](STRUCTURE.md) — follow configuration, reads, and scan submissions through the extension.
