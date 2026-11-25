# Mission work in AnalyseMe

For maintainers using Mission to change AnalyseMe: the repository records what the change should do and why; the Mission handoff records what a step actually did and verified.

## How work moves through Mission

1. **Request → design.** Objective 5 started with “Create docs for AnalyseMe.” The clarification added reorganizing the docs, specs, architecture and Mission records. The [objective 5 design (repository)](https://github.com/senad-d/analyseme/blob/main/docs/specs/analyseme-documentation.md) defines the readers, page responsibilities and decisions. It rules out runtime and Mission configuration changes.
2. **Design → executable plan.** The [objective 5 plan (repository)](https://github.com/senad-d/analyseme/blob/main/docs/tasks/5-plan.md) turns that design into bounded tasks with owned files, dependencies, acceptance criteria and shared verification. For example, the Mission guide depends on the package file selection change: the guide ships, but the nested design and plan it points to stay in the repository.
3. **Plan → assignment and changes.** In Mission’s `deliver-plan` workflow, the assigner matches tasks to agents. For a multi-task plan, agents implement in separate worktrees; independent tasks can run in parallel and dependent tasks wait. The plan is committed on the feature branch and goes into the pull request. The assignment points the implementer to the relevant plan heading rather than duplicating it.
4. **Changes → review and delivery.** Mission integrates the tasks and verifies and reviews the combined change before the pull request. Objective 5’s plan calls for following reader routes and checking the package contents. Those are checks to run, not results. Look at the step handoffs for what ran and at the pull request for the proposed changes, review and CI status. A checked box or an opened pull request does not establish that the change shipped.

For the workflow itself, ask the Mission dispatcher for **Deliver or deliver-plan** in *Choosing work*. It can look up that section and the other Mission documentation named below with its `mission_docs` tool.

## Where records live

| What you need | Where to look or write |
| --- | --- |
| Project terms | The [context glossary (repository)](https://github.com/senad-d/analyseme/blob/main/CONTEXT.md) owns terms such as active issue, analysis scope and security hotspot. |
| Current product and engineering guidance | The [product brief](PROJECT_DEFINITION_BRIEF.md) describes what AnalyseMe does. The [implementation guidelines (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-guidelines.md) describe engineering constraints. The [configuration TUI standard (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-configuration-tui-design-standard.md) is a general design reference, not a feature list for the AnalyseMe status panel. |
| How it runs and why | The [architecture spec (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-architecture.md) explains the running system. Use `docs/adr/` for durable design decisions, such as the [Sonar scan boundary (repository)](https://github.com/senad-d/analyseme/blob/main/docs/adr/0001-sonar-scan-boundary.md), which explains why reading findings and explicitly submitting a scan are separate. |
| Spec for a proposed change | Put the work-specific design in `docs/specs/`, as the objective 5 design does. Capture scope, constraints and decisions there. If the change alters the product contract, update the relevant current spec instead of leaving the new behavior only in the proposal. |
| Plan for delivery | Put the executable plan in `docs/tasks/`, as the objective 5 plan does. Use the [task format in AGENTS.md (repository)](https://github.com/senad-d/analyseme/blob/main/AGENTS.md#task-golden-standard-example): a checkbox, Why, How, Where and acceptance criteria. Name the files and dependencies, state what would prove acceptance and mark the task only when those criteria are met. |
| Checks to run | The [validation guide](VALIDATION.md) explains the validation procedure; the [check registry](testing.md) maps targeted checks to the behavior they guard. Neither records results for a particular change. |

This guide ships with the npm package. Links labeled **repository** go to files on GitHub that are not installed with it.

## Backlog, review history and skills

These records answer questions about planned or reviewed work, not what the extension does today:

- [Implementation backlog (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-tasks.md): follow-up tasks from the original implementation. An entry’s checkbox is not verification evidence.
- [First-pass review, 2026-07-02 (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-review-pi-extension-first-pass-tasks.md): security, runtime safety, and dependency and CI supply-chain findings.
- [Second-pass review, 2026-07-02 (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-review-pi-extension-second-pass-tasks.md): maintainability, logic and validation gaps.
- [Final-pass review, 2026-07-02 (repository)](https://github.com/senad-d/analyseme/blob/main/specs/spec-review-pi-extension-final-pass-tasks.md): rechecked prior claims, core Pi behavior and edge cases, and recorded what remained unverified.
- [Objective 18 plan (repository)](https://github.com/senad-d/analyseme/blob/main/docs/tasks/18-plan.md): earlier Mission plan for pinning the supported TypeScript version and keeping Dependabot proposals within the supported range. It is not a current assignment or proof that CI passed.

The [SonarQube task-spec skill (repository)](https://github.com/senad-d/analyseme/blob/main/skill/SKILL.md) turns active Sonar issue details into remediation specs, up to 20 issues per page and output file. These are candidate tasks, not a Mission delivery plan with ownership and dependencies. The skill is neither packaged nor registered as an AnalyseMe tool.

## Evidence, decisions and questions

- **What belongs in Git:** Keep requirements and acceptance criteria in the spec and plan. Record lasting rationale and trade-offs in an ADR when future maintainers need to know why a design was chosen.
- **Where to find the outcome:** Open the objective in Mission and read the relevant step’s handoff. A handoff identifies changed paths, commands actually run and their results, artifacts the next step needs, and anything that could not be verified. Dependent steps receive these handoffs without needing them committed. Summarize the checks and limitations for reviewers under **Validation** in the [pull request template (repository)](https://github.com/senad-d/analyseme/blob/main/.github/PULL_REQUEST_TEMPLATE.md#validation).
- **Where to find a pending question:** A step that needs a user answer reports `blocked` with the question. Look in Mission’s attention pane, the web app’s attention drawer or the blocked step’s panel. An operational obstacle such as an unavailable tool is reported as `needs_attention` and routed to the dispatcher, not presented as a design decision for the user.

Project-level Mission rules and notifications are configured in `.pi/mission.yaml`. That file configures the workflow; it does not record whether a run passed. Do not commit local Mission state or treat it as validation evidence. For the engine’s behavior, see **Passing context** and **Questions and attention** in Mission’s shipped *Concepts* documentation, and **Rules** and **Notifications** in *Configuration*.
