# AnalyseMe implementation tasks

## Purpose

This is the canonical implementation backlog for follow-up AnalyseMe work. Keep tasks ordered, unchecked until validated, and focused on implementation changes that preserve the extension's read-only Sonar boundary.

## Task format

Each task must use `- [ ]`, include a clear reason for the work, and list concrete acceptance criteria before it can be marked complete.

## Ordered implementation backlog

- [ ] Add Sonar compatibility fixtures for component and path payload variants

#### Why

SonarQube and SonarCloud versions can expose file locations through slightly different component, path, and text-range fields. Dedicated fixtures keep the agent-facing location output honest as the mapper evolves.

#### How to resolve

- Add mocked Sonar issue and security hotspot payloads for simple project keys, project keys that contain colons, explicit file/path fields, secondary locations, flows, and missing location fields.
- Cover the fixtures through mapper and tool tests without live Sonar credentials.
- Document any intentional fallback behavior in mapper comments or validation docs when a file path cannot be derived safely.

#### Acceptance criteria

- Tests cover issue and hotspot location mapping for at least simple keys, colon-containing keys, explicit path fields, and ambiguous component keys.
- Ambiguous component keys do not render misleading partial paths.
- Default validation remains offline and does not require live Sonar credentials.
- `npm run test` passes.

- [ ] Document an optional live Sonar smoke-test matrix

#### Why

Default validation is intentionally offline, but maintainers still need a repeatable manual checklist for checking compatibility against real SonarQube and SonarCloud instances before releases.

#### How to resolve

- Add a manual smoke-test matrix covering SonarQube, SonarCloud with organization, branch analysis, pull-request analysis, issue detail, and security hotspot detail.
- Keep all commands token-safe and avoid printing secret environment variable values.
- Link the matrix from the validation documentation and README development section.

#### Acceptance criteria

- Documentation names the required environment variables without exposing example secrets.
- The smoke matrix distinguishes mandatory offline validation from optional live checks.
- The checklist covers all five `analyseme_*` tools and `/analyseme` command output.
- `npm run format:check` passes.

- [ ] Add release readiness checks for package provenance and workflow pinning

#### Why

AnalyseMe is distributed as a Pi extension package. Release preparation should keep npm package contents, workflow action pinning, and security notes visible so publishing does not drift from repository policy.

#### How to resolve

- Extend release documentation with package dry-run review, pinned GitHub Actions review, changelog update, and clean working tree expectations.
- Add tests or scripts only if they can run offline and do not require publishing credentials.
- Keep package contents checks excluding specs, local state, generated reports, and secrets.

#### Acceptance criteria

- Release documentation includes a clear package-provenance and workflow-pinning checklist.
- Existing package dry-run checks remain the source of truth for publishable files.
- No release-readiness command requires npm publishing credentials in default validation.
- `npm run validate` passes.
