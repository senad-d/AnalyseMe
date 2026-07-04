---
name: sonarqube-to-tasks
description: Generate SonarQube/SonarCloud remediation task spec files from AnalyseMe issue details only. Use when asked to turn Sonar issues into markdown tasks, max 20 issues per file.
---

# SonarQube Task Spec

<purpose>
Create one markdown task per active Sonar issue. Use Sonar issue details for Why/How. Do not inspect source code. One output file holds up to 20 issues.
</purpose>

<workflow>
Repeat until all active issues are processed:

1. Call `analyseme_list_issues` with `limit: 20`, `page: <n>`, and only user-provided `projectKey`, `organization`, `branch`, or `pullRequest`.
   - If the key is missing, the result is wrong, or zero issues are unexpected, ask for `projectKey` and optional `organization`, then stop.
2. For each issue returned on that page, call `analyseme_get_issue` with the issue key and the same Sonar parameters.
   - These calls provide Sonar's Why/How guidance.
   - Run only for the current 20-issue page.
3. Write one spec file for that page.
   - If total issues <= 20: `specs/spec-sonarqube-issues.md`.
   - If total issues > 20: `specs/spec-sonarqube-issues-<n>.md`.
4. Continue with page `<n + 1>` only when AnalyseMe reports more active issues.
5. Final response only: list created file path(s) and issue count.
</workflow>

<format>
# <Project> tasks — batch <n>

This task spec was generated from active SonarQube issues.

- Sonar project: `<project key>`
- Organization: `<organization, if known>`
- Active issues read: <total>

### 1. <task name>

- [ ] Resolve Sonar issue `<issue key>`: <exact Sonar message>.

#### Why
<copy or tightly condense Sonar issue root cause / potential impact from `analyseme_get_issue`>

#### How
<copy or tightly condense Sonar issue how-to-fix guidance from `analyseme_get_issue`>

#### Where
- `<file path>:<line>`
- Rule: `<rule key>`
- Type/severity: `<type>; <severity/impact>`

#### Acceptance criteria
- The flagged Sonar issue is remediated at the listed location.
- Intended behavior is preserved.
- Tests passing.

</format>

<rules>
- One task per Sonar issue.
- Title describes the remediation, not just the Sonar message.
- Use exact issue keys, messages, locations, rules, type, and severity from AnalyseMe.
- Base `Why` and `How` on `analyseme_get_issue` Sonar-provided guidance.
- Keep copied Sonar guidance concise enough for a task file; do not paste full long rule documentation.
</rules>

<do_not_do>
- Do not read source files.
- Do not call `analyseme_get_project_summary`.
- Do not run tests.
- Do not run lint/typecheck/format commands.
- Do not run git commands.
- Do not run shell validation/counting commands.
- Do not edit unrelated files.
- Do not update changelog files.
- After the spec file(s) are written, do not call more tools.
</do_not_do>
