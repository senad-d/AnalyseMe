# Context Glossary

## Active issue
A SonarQube/SonarCloud issue that still needs attention from the agent. Accepted, false-positive, ignored, resolved, closed, or equivalent non-actionable issues are not active issues.

## Current project
The repository where Pi is running. AnalyseMe should prefer the Sonar project key explicitly passed by the agent, then configured for the repository, before using diagnostics from version-control metadata.

## Sonar project key
The canonical identifier used by SonarQube/SonarCloud to query a project. It is not necessarily the same as the git repository name.

## Analysis scope
The optional SonarQube/SonarCloud branch or pull request context for queries. Branch and pull request scopes are mutually exclusive.

## Security hotspot
A SonarQube/SonarCloud finding that requires security review and is exposed through hotspot APIs rather than normal issue APIs. Security hotspots are read-only in AnalyseMe and should be listed/fetched separately from active issues.

## Sonar rule guidance
Fix guidance, remediation text, examples, or educational rule metadata returned by SonarQube/SonarCloud APIs. AnalyseMe should surface this guidance but not invent its own remediation advice.
