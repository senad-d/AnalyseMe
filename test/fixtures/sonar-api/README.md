# Sonar API compatibility fixtures

These fixtures are sanitized, synthetic test payloads that mirror public SonarQube/SonarCloud read-only API shapes AnalyseMe supports. They contain no private project identifiers, source code, tokens, hostnames, or customer data.

## Matrix

- `sonarqube-10.6-core.json`: SonarQube 10.6-style quality gate, measures, issue search/detail, rule `descriptionSections`, issue snippets, hotspot search/detail, and source context.
- `sonarqube-9.9-fallbacks.json`: SonarQube 9.9 LTS-style issue detail fallbacks for `htmlDesc`, `textRange.startLine`, colon-containing project keys, and `/api/sources/show` when issue snippets are unavailable.
- `sonarcloud-current-hotspots.json`: SonarCloud-style hotspot payloads with top-level security guidance fields, author/assignee metadata, flat hotspot detail responses, and `source` line arrays.

## Unsupported variants

Live server compatibility is not proven by these fixtures. Known unsupported or unclaimed variants include private plugin-specific fields, deprecated mutation endpoints, and payloads that omit required issue/hotspot keys.
