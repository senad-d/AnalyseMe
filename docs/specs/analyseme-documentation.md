# AnalyseMe documentation set

Kind: documentation

## Purpose and scope

“Create docs for AnalyseMe.” The clarification is “I need evrithing about documentation reorganized, I also need specs, arhitecture, and anithing else that comes with mission”. Cover the operator, contributor and maintainer journeys together: using the extension, changing it, understanding its specification and architecture, and following work through Mission.

Reorganize by the question a reader brings, not by relocating every file. Rewrite current guidance; index historical evidence without rewriting its findings. The deliverables are repository Markdown and the smallest documentation packaging adjustment. No new extension, UI, scanner behavior, documentation site, release, CI job or Mission configuration.

## Readers

| Reader | Comes to do | Knows |
| --- | --- | --- |
| Pi user | Install in a project, check status, inspect one actionable finding and decide whether to submit a fresh scan. | Has Pi and a repository; need not know Sonar’s issue vs hotspot APIs. |
| Agent operator / CI user | Supply a safe configuration, choose the right tool and interpret partial or empty results. | Has an analyzed Sonar project for real reads; understands environment variables. |
| Contributor | Find a module, use the offline checks, change a documented behavior and submit it safely. | Knows TypeScript and npm; need not have Sonar credentials. |
| Maintainer using Mission | Find the current spec, understand a design decision, plan a change and tell a historical checklist from evidence. | Knows the change they want; need not know the repository’s planning conventions. |

## Pages today

| Path | Covers | Wrong or out of date | Checked against |
| --- | --- | --- | --- |
| `README.md` | Install, setup, tools, troubleshooting, development, publishing. | Correctly names six tools, but the user must navigate maintainer procedures to find reference material. | README contents; `src/extension.ts:analyseMeExtension` |
| `CONTRIBUTING.md` | Checkout, validation, current status, PR checklist. | Current-status list omits the scan; points to implementation-era plans as future work. | `src/extension.ts:registerRunScanTool` registration; `package.json:scripts` |
| `SECURITY.md` | Credentials, files, network, reporting, optional scan. | Good starting point; distinguish extension reads from the external scanner’s local work directory; avoid duplicating setup tables. | `src/tools/run-scan.ts:executeRunScanTool`, `src/scan/scanner.ts:SCANNER_WORK_DIR` |
| `CONTEXT.md` | Project vocabulary. | Keep authoritative; reference rather than copy definitions. | `src/config/project-key.ts:resolveProjectKey`, `src/tools/list-issues.ts`, `src/tools/list-security-hotspots.ts` |
| `AGENTS.md` | One-task rule and checklist format. | Keep as repository instructions, not a second contributor manual. | `AGENTS.md:Task golden standard example` |
| `CHANGELOG.md` | Release and unreleased history, including scan. | Keep history; an unreleased entry is not proof a version is on npm. | `CHANGELOG.md:Unreleased`, `package.json:version` |
| `docs/PROJECT_DEFINITION_BRIEF.md` | Bootstrap, product intent, planned surface and assumptions. | Machine-local paths, five-tool inventory and unconditional no-write statements do not specify the implemented product. | `test/preparation.test.mjs:approved project brief and implementation specs exist`, `src/extension.ts` |
| `docs/STRUCTURE.md` | Source layout, surfaces, UI and checks. | Missing `src/scan/`, presents all tools as read-only. | `src/scan/scanner.ts`, `src/extension.ts` |
| `docs/VALIDATION.md` | Checks, smoke, TUI, fixtures and optional live work. | Conflates the five names checked by the smoke script with the full registry, and generalizes GET-only behavior. | `scripts/pi-smoke.mjs:toolNames`, `test/public-surface-contract.test.mjs:expectedToolSchemaFields` |
| `docs/testing.md` | Special check registry. | Keep the targeted policy entry; not the procedure for running the whole suite. | `test/typescript-policy.test.mjs`; `docs/VALIDATION.md:Default validation` |
| `test/fixtures/sonar-api/README.md` | Synthetic compatibility matrix and limits. | Keep as the authority for fixtures; not a live compatibility certification. | `test/sonar-compatibility-fixtures.test.mjs` |
| `specs/spec-architecture.md` | Proposed layout, data flow, interfaces and phases. | Future-tense five-tool plan; no current scanner execution path. | `package.json:pi.extensions` → `src/extension.ts`; `src/tools/run-scan.ts` |
| `specs/spec-guidelines.md` | Proposed implementation rules. | Mixes build phases with constraints; does not distinguish scanner from HTTP client. | `src/sonar/client.ts:HttpSonarClient`, `src/scan/scanner.ts:runScannerProcess` |
| `specs/spec-configuration-tui-design-standard.md` | Generic editable configuration TUI standard. | Keep as design input; not everything in it applies to a read-only status panel. | `src/commands/analyseme.ts:handleAnalyseMeCommand`, `test/config-tui.test.mjs` |
| `specs/spec-tasks.md` | Implementation backlog. | Backlog, not an as-built spec or proof of completion; keep entries/statuses. | `specs/spec-tasks.md:Purpose`, `test/sonar-compatibility-fixtures.test.mjs` |
| `specs/spec-review-pi-extension-first-pass-tasks.md` | First review, evidence and tasks. | Retain as dated evidence; do not declare findings fixed. | Page’s “Review scope and date” and “Blocked checks or areas not reviewed” |
| `specs/spec-review-pi-extension-second-pass-tasks.md` | Second review and follow-up. | Same historical status. | Page’s “Review scope and date” and “Findings summary by severity” |
| `specs/spec-review-pi-extension-final-pass-tasks.md` | Final review and recorded unknowns. | Same historical status. | Page’s “Previous claims or assumptions verified” and “Unknowns resolved” |
| `docs/tasks/18-plan.md` | Prior Mission plan for a compiler constraint. | Preserve as a worked record, not a current assignment or proof a PR passed. | `docs/tasks/18-plan.md:Task pin-supported-typescript`, `docs/testing.md` |
| `skill/SKILL.md` | Repository skill for turning active issues into task files. | Not a seventh extension tool or a packaged Pi skill. | `skill/SKILL.md:workflow`, `package.json:pi` and `files` |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR summary, validation and disclosure checklist. | Retain as the submission form, not an alternative task plan. | Template’s “Validation”; `package.json:scripts.validate` |

Also keep `LICENSE`, the issue forms in `.github/ISSUE_TEMPLATE/` and `.pi/mission.yaml` in place. They are a license, GitHub forms and local Mission policy, respectively, not chapters for rewriting. `test/preparation.test.mjs` reads the brief, architecture and guidelines at their existing paths; `scripts/check-package-contents.mjs:forbiddenChecks` rejects any packed path containing `/specs/`.

## Pages

| Path | Type | Reader | Questions it answers | New, changed or removed |
| --- | --- | --- | --- | --- |
| `README.md` | tutorial | Pi user | How do I get from installation to a specific finding? | Changed; retain existing entry anchors and demo. |
| `docs/README.md` | reference | All | Which page answers my question? | New; single documentation index. |
| `docs/SETUP.md` | how-to | Operator | How do I configure, troubleshoot, update or remove the extension? | New; moves procedures out of README. |
| `docs/TOOLS.md` | reference | Operator | What inputs, results, limits and side effects do the commands and six tools have? | New; replaces the README tool catalogue. |
| `CONTRIBUTING.md` | how-to | Contributor | How do I develop, submit and, as a maintainer, publish a change? | Changed; takes the existing release instructions from README. |
| `docs/VALIDATION.md` | how-to | Contributor | How do I validate offline, and what does each optional check prove? | Changed; link rather than duplicate fixture/check registries. |
| `SECURITY.md` | reference | All | Which component can read, write or disclose what, and where do I report a problem? | Changed; retains security-policy entry point. |
| `docs/PROJECT_DEFINITION_BRIEF.md` | reference | Maintainer | What must the current product do and not do? | Changed in place; current functional spec. |
| `specs/spec-guidelines.md` | reference | Contributor | What constraints apply when implementing a change? | Changed in place; current engineering spec. |
| `docs/STRUCTURE.md` | reference | Contributor | Where would I change a particular behavior or its checks? | Changed in place; module map, not a second architecture. |
| `specs/spec-architecture.md` | explanation | Maintainer | How do registration, configuration, retrieval, scan and output fit together? | Changed in place; as-built architecture. |
| `docs/adr/0001-sonar-scan-boundary.md` | explanation | Maintainer | Why is uploading an analysis different from changing a finding? | New; records an existing decision, not a proposed capability. |
| `docs/MISSION.md` | explanation | Maintainer | How does a request become a spec, plan, change and verified result here? | New; links current and historical artifacts. |

This is the set to author. Other pages in **Pages today** stay available at their existing paths and are indexed in context; none is removed. The generic TUI standard remains a standard, not a feature request.

## Content per page

### README.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| AnalyseMe | Package, existing logo/demo, who it helps; five read tools and one optional upload. Link the docs index at the top. | `package.json:pi`, `src/extension.ts:analyseMeExtension`, existing README intro |
| Quick Start | Install, set placeholder values via setup, start Pi in the project; use `/analyseme help` and `/analyseme` to distinguish help/status from a Sonar query. | README Quick Start; `src/commands/analyseme.ts:handleAnalyseMeCommand` |
| Inspect a finding | One walk-through: request summary, request a bounded page, pass a returned `issueKey` to detail and interpret its location/guidance. Use the synthetic `demo` project, `ISSUE-10`, `src/index.ts:42` as an illustration, not a live response or the cause of the gate. An empty active list is a valid stopping point. No scan required. | `test/fixtures/sonar-api/sonarqube-10.6-core.json:projectStatus/issueSearch/ruleShow`; `test/get-issue-tool.test.mjs` |
| Next steps | Link setup, tools/hotspots/scan, docs index and security; maintain the existing README contents’ fragment targets with short links, not cloned chapters. Keep license and credit. | README Table of Contents, Update and Uninstall, Publishing, License; `LICENSE` |

### docs/README.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Use AnalyseMe | First inspection → setup and diagnosis → command/tool reference. Link security policy and changelog for their own purposes. | This design: Pages; `README.md`, `SECURITY.md`, `CHANGELOG.md` |
| Contribute | Checkout/change/PR, source map, validation, specialized checks and glossary. | `CONTRIBUTING.md`, `docs/STRUCTURE.md`, `docs/VALIDATION.md`, `docs/testing.md`, `CONTEXT.md` |
| Specifications and Mission | Product, technical rules, as-built architecture, decision record, Mission guide. Put backlog and dated reviews behind the Mission guide rather than presenting them as instructions. | `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/`, `docs/tasks/18-plan.md` |

### docs/SETUP.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Install | Requirements and commands already documented for global, project-local, one-run, pinned Git and local checkout; distinguish package install from contributor setup. | README Installation; `package.json:engines`, `pi.extensions` |
| Configure locally | Minimal inert `.env` example; URL/token, optional organization, project key, branch or PR. Shell wins over `.env` for connection config. HTTPS by default; intentional local HTTP opt-in and warning. The scanner binary override is a **process environment** setting, not a `.env` field loaded by `loadAnalyseMeConfig`. | `src/constants.ts`, `src/config/load-config.ts:loadAnalyseMeConfig`, `src/scan/scanner.ts:resolveScannerCommand` |
| Select project and scope | Explicit key → configured key → `sonar.projectKey`; Git remote is diagnostic only. Call-level organization override; explicit scope → configured → Actions → default; branch/PR conflict is an error. | `src/config/project-key.ts:resolveProjectKey`, `src/config/analysis-scope.ts:resolveAnalysisScope`, `src/tools/shared.ts` |
| Use in CI | Show existing noninteractive example with secrets/variables and Pi already available; label branch-only example, distinguish PR scope; no actual workflow change. | README Configuration; `src/config/analysis-scope.ts`, `src/commands/analyseme.ts` |
| Troubleshooting | Symptom → action: missing config/key or wrong scope, rejected URL, 401/403, empty vs shortened page, scanner missing or nonzero, upload not yet visible. Link to scan reference; no automatic install, scan or credential disclosure. | README Troubleshooting; `src/tools/shared.ts`, `src/sonar/client.ts`, `src/tools/run-scan.ts` |
| Update and uninstall | Preserve documented global and project-local maintenance commands. | README Update and Uninstall |

### docs/TOOLS.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Commands | `/analyseme` masked interactive status or text outside TUI; `/analyseme help` is setup/help, not a connectivity or freshness test. | `src/commands/analyseme.ts:handleAnalyseMeCommand` |
| Common inputs and results | Types, required/optional and scope rules. Project-level calls need a resolvable key; by-key detail calls have optional project context. `content` vs `details`, warnings, partial/missing data, truncation, safe treatment of Sonar text. | `src/tools/shared.ts:resolveProjectToolContext/resolveOptionalProjectToolContext`, `test/public-surface-contract.test.mjs` |
| Project summary | Exact name and four scope inputs; gate/metrics, missing metrics and warnings; not a scan. | `src/tools/project-summary.ts:ProjectSummaryToolInput`, `test/project-summary-tool.test.mjs` |
| Active issues | Separate list and get entries: exact names, pagination, active exclusions, `issueKey`, location, flows, snippets, optional rule guidance; distinguish absence from remediation advice. | `src/tools/list-issues.ts`, `src/tools/get-issue.ts`, `CONTEXT.md:Active issue` |
| Security hotspots | Separate list and get entries: reviewable vs non-review, `hotspotKey`, optional locations/source and Sonar security guidance; not issue status transitions. Both list tools use page 1 by default; limit 1–100, default 50. | `src/tools/list-security-hotspots.ts`, `src/tools/get-security-hotspot.ts`, `src/tools/list-issues.ts` |
| Submitting a scan | Exact name; common inputs plus `properties` (array of `key=value` strings), `waitForQualityGate` (default false), `timeoutSeconds` (10–3600, default 600). CLI override/PATH, scan-authorized token, local process/upload side effect; reject managed connection/credential properties. Interpret exit/timeout, sanitized log, missing report, CE task and gate wait; do not promise immediate results. | `src/tools/run-scan.ts:runScanParameters/executeRunScanTool`, `src/scan/scanner.ts:RESERVED_SCANNER_PROPERTY_KEYS/readScannerReportTask`, `test/run-scan-tool.test.mjs` |

For each public tool give one small valid input and the useful result fields, not a verbatim payload. Use the identifiers from `test/public-surface-contract.test.mjs:expectedToolSchemaFields` and field types/defaults from each tool’s schema; tool names are not slash commands.

### CONTRIBUTING.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Prepare a checkout | Node version from manifest, npm, Pi, documented clean install; isolated local start; no Sonar account for default checks. | `package.json:engines/scripts.dev`, README Installation, `docs/VALIDATION.md` |
| Make and submit a change | Choose the relevant product spec, engineering guidelines, module and check; one focused change, check box only after acceptance, link PR template, issue forms, validation and Mission guide. | `AGENTS.md`, `specs/spec-guidelines.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/` |
| Publishing | Preserve the documented maintainer-only manual release instructions and prerequisites, distinguish dry-run from publish; link changelog and existing release workflow. Do not run a release for docs verification. | README Publishing; `scripts/publish-npm.mjs`, `.github/workflows/publish.yml` |

### docs/VALIDATION.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Default validation | Setup link; `npm run validate` and what it includes; offline mocks vs scan-process tests; separate targeted check registry. | `package.json:scripts.validate`, `docs/testing.md`, `test/run-scan-tool.test.mjs` |
| Package contents check | `npm run check:pack`, reader docs that ship and repository-only artifacts; existing deny rules remain in force. | `scripts/check-package-contents.mjs:forbiddenChecks/readPackFiles`, `package.json:files` |
| Isolated Pi smoke test | `npm run smoke:pi` checks help/status and masking with placeholders. The script looks for the five read-tool names; the registry test checks six registrations/schemas. Neither proves live Sonar access. | `scripts/pi-smoke.mjs:smokeChecks/toolNames`, `test/public-surface-contract.test.mjs` |
| Targeted checks | Interactive vs text status and read-only TUI deviations; point to the fixture matrix and policy registry once, rather than recopying them. | `test/config-tui.test.mjs`, `test/fixtures/sonar-api/README.md`, `docs/testing.md` |
| Optional live Sonar smoke test | Separate, opt-in, credentialed read check; no scan in default or required live instructions. | Existing `docs/VALIDATION.md:Optional live Sonar smoke test`, `SECURITY.md` |

### SECURITY.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Supported versions | Preserve maintainer policy without inferring a release date or supported server versions from fixtures. | Existing SECURITY Supported versions; `test/fixtures/sonar-api/README.md` |
| Security model | Read tools vs optional upload; permissions and trust placed in Pi extension and local scanner. Link the design decision for rationale. | `src/extension.ts`, `src/tools/run-scan.ts:executeRunScanTool` |
| Credentials and local files | Mask presence, avoid secrets in examples/logs, reads vs writes; scanner uses environment for URL/token and may create `.scannerwork` in cwd. No promise that a third-party scanner leaves a clean tree. | `src/config/load-config.ts`, `src/tools/run-scan.ts:buildScannerEnv/buildRunScanLog`, `src/scan/scanner.ts:SCANNER_WORK_DIR` |
| Network and data handling | GET client, default HTTPS, no telemetry; scanner submit path; Sonar snippets/guidance may be sensitive. Link setup instead of another variable catalogue. | `src/sonar/client.ts`, `src/utils/text-safety.ts`, existing SECURITY Data handling |
| Reporting a vulnerability | Keep private reporting route and warning against posting tokens or private source. | Existing SECURITY Reporting a vulnerability |

### docs/PROJECT_DEFINITION_BRIEF.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Product and readers | `@senad-d/analyseme` is a Pi extension for inspecting existing Sonar analyses and optionally submitting one. Users, use cases, non-goals; remove machine-specific bootstrap narrative. | `package.json:name/pi`, `src/extension.ts:analyseMeExtension` |
| Observable behavior | Requirements → observable result → source/test: status/help, `analyseme_get_project_summary`, active issues, separate hotspots and by-key details, optional scan. Summarize guarantees; link the tool reference for fields. | `src/constants.ts`, `test/public-surface-contract.test.mjs`, `test/analyseme-command.test.mjs`, `test/run-scan-tool.test.mjs` |
| Constraints and evidence | Resolution, safe output, no issue mutation or configuration editor, Sonar-provided guidance only, and limits of offline proof. Link glossary, architecture, validation and generic TUI applicability. | `CONTEXT.md`, `test/config.test.mjs`, `test/config-tui.test.mjs`, `SECURITY.md` |

### specs/spec-guidelines.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Implementation constraints | Small typed registration modules, no nested functions, disposable lifecycle, config vs endpoint vs mapping responsibilities, declared peers/package boundaries. No template bootstrap phases. | `AGENTS.md`, `src/extension.ts`, `src/events/lifecycle.ts`, `package.json:peerDependencies` |
| Tool and UI contracts | Schema and prompt guidance, output/error/abort/truncation, sanitized external data, `SONARQUBE_TOKEN` secrecy; GET client vs scan process. Read-only adapted TUI, not generic edit/search/save. | `test/public-surface-contract.test.mjs`, `test/tool-error-contract.test.mjs`, `test/config-tui.test.mjs`, `src/tools/run-scan.ts` |
| Evidence for changes | Map changed behavior to its existing check; link contributor/validation guide and product spec. Do not require every historical backlog item. | `docs/VALIDATION.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `test/preparation.test.mjs` |

### docs/STRUCTURE.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Runtime map | Path → responsibility, covering registration, commands/UI, config, lifecycle, GET endpoints/mappers, `src/scan/`, tool adapters and output utilities. | `src/extension.ts` imports, `src/tools/shared.ts`, `src/scan/scanner.ts` |
| Where to change what | Worked lookups: field resolution → config tests; issue vs hotspot → mapping/tool tests; scan execution → scanner/tool tests; status → UI tests. | `test/config.test.mjs`, `test/sonar-mapping.test.mjs`, `test/run-scan-tool.test.mjs`, `test/config-tui.test.mjs` |
| Repository support files | Point to scripts, tests/fixtures, docs/specs and Mission map; link architecture for interactions; no second architectural narrative. | `package.json:scripts`, `test/fixtures/sonar-api/README.md`, `docs/tasks/18-plan.md` |

### specs/spec-architecture.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| System boundary | As-built context/data-flow sketch (plain Markdown is enough): Pi, AnalyseMe, local files/env, SonarQube/SonarCloud, scanner subprocess. State who initiates each flow. | `package.json:pi.extensions`, `src/extension.ts`, `src/tools/run-scan.ts` |
| Startup and status | Registration delegates, session start/shutdown clear stale UI status; local masked status vs text help; no background scan. | `src/events/lifecycle.ts:registerAnalyseMeLifecycle`, `src/commands/analyseme.ts` |
| Reading analysis | Trace one call through config/key/scope → endpoint → GET client → mapper → `content`/`details`. Point out optional source/rule requests, partial-data warnings, bounds, masking and cancellation; separate issue and hotspot endpoints. | `src/tools/get-issue.ts`, `src/tools/get-security-hotspot.ts`, `src/tools/shared.ts`, `src/sonar/client.ts`, `src/sonar/endpoints.ts` |
| Submitting analysis | Trace explicit scan call → scoped arguments and environment → local CLI → server processing/report task → result; include timeout/abort, nonzero exit, missing report and optional wait. Distinguish credential transport from CLI arguments. | `src/tools/run-scan.ts:executeRunScanTool/buildScannerEnv`, `src/scan/scanner.ts:runScannerProcess/readScannerReportTask` |
| Boundaries and decisions | Link ADR for rationale, security for policy, structure for code locations, product spec for requirements and tests for proof. No speculative services or storage. | `SECURITY.md`, `test/run-scan-tool.test.mjs`, `test/sonar-client.test.mjs` |

### docs/adr/0001-sonar-scan-boundary.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| Context | Users may need fresh analysis after local changes; read queries alone cannot submit it. Record the existing decision retrospectively; no invented approval/date. | `CHANGELOG.md:Unreleased`, `src/tools/run-scan.ts:registerRunScanTool` |
| Decision | Keep five retrieval tools read-only; only an explicit scanner tool submits analysis. It is not an API for mutating issue/hotspot states. | `src/extension.ts:analyseMeExtension`, `SECURITY.md:Security model` |
| Consequences | Local scanner prerequisite/work files, upload permission, async results, managed properties and redaction; point back to usage and architecture. | `src/scan/scanner.ts`, `src/tools/run-scan.ts`, `test/run-scan-tool.test.mjs` |

### docs/MISSION.md

| Heading | What it holds | Source of the facts |
| --- | --- | --- |
| How work moves through Mission | One project example: request → design and bounded plan → assignment and changes → verification/review → handoff/PR. A checkbox, plan or proposed task is not evidence that a change shipped. Use Mission’s shipped docs for the engine, not a second Mission manual. | Mission `choosing-work`, “Deliver or deliver-plan”; `AGENTS.md`; `docs/tasks/18-plan.md` |
| Where records live | A lookup table: vocabulary → `CONTEXT.md`; current product/engineering/UI specs → their existing paths; as-built architecture and ADR → design/rationale; work-specific design → `docs/specs/`; executable task plans → `docs/tasks/`; validation/check registry → evidence to obtain, not results. Show this documentation design and plan as a real pair. | Local files in Pages today; this design and the objective 5 task plan; Mission `choosing-work`, “Deliver or deliver-plan” |
| Backlog, review history and skills | Explicitly link the original implementation backlog, each of the three review passes and objective 18 plan. Identify what each is, without closing, reopening or staffing tasks. Distinguish repository-only `skill/SKILL.md` remediation specs (20 issues/page) from Mission delivery plans and installed Pi tools. | `specs/spec-tasks.md:Purpose`, the three `specs/spec-review-pi-extension-*-tasks.md` headers, `docs/tasks/18-plan.md`, `skill/SKILL.md:workflow`, `package.json:pi` |
| Evidence, decisions and questions | Requirements/acceptance in tracked docs; actual results/limitations in handoffs; report artifacts, changed paths and checks. Record durable design rationale as an ADR where warranted, not an empty placeholder. Distinguish a user question from an operational obstacle; refer readers to shipped Mission concepts/configuration and the project’s `.pi/mission.yaml` without embedding its contents or treating local state as evidence. | Mission `concepts`, “Passing context” and “Questions and attention”; `.pi/mission.yaml` rules/notifications, `.github/PULL_REQUEST_TEMPLATE.md:Validation` |

## Conventions

| Rule | Example |
| --- | --- |
| One page owns a subject; write for one reader action or question. | Tutorial demonstrates one issue. Setup owns the CI example. Tool reference owns parameter tables. Architecture links to the decision instead of retelling it. |
| Use project vocabulary and actual Pi names. | “Active issue”, “analysis scope”, “security hotspot” per `CONTEXT.md`; `/analyseme` is a command, `analyseme_get_issue` is a tool. |
| Ground claims in current code and checks; separate intent, runtime, releases and historical results. | The smoke script checks some help text; the registry contract test checks six tools; neither certifies a live server. |
| Use examples safe to copy. | Synthetic fixture IDs, obvious local placeholders and Actions secret references only. Label `.env` vs shell `export`, Pi prompts vs shell commands, what runs offline vs what contacts Sonar. Never source real credentials. |
| Preserve navigation in the checkout, on GitHub and in published reader docs. | Use the plan’s **Reader routes** and **Package boundary** contracts. Retain README fragments; use readable relative links between shipped pages and explicit repository links to excluded records. |
| Keep process files at their functional paths; preserve records as written. | `test/preparation.test.mjs` reads the existing spec paths. Link a historical review, do not reset its checkboxes or recast it as a current requirement. |
| Use the existing documentation tooling. | Plain Markdown, LF, no trailing spaces; `scripts/check-format.mjs` is a format check, not a link checker. |

## Navigation

| From | To | How |
| --- | --- | --- |
| Package README | First inspection and docs index | Direct link above the fold; previous installation/config/tools/troubleshooting/maintainer fragments route to their new owners. |
| Index: Use AnalyseMe | Tutorial → setup → tools; security and changelog | Task-oriented labels, not a directory dump. Return link from setup/tools to the index. |
| Index: Contribute | Contributor guide → structure/validation → tests, fixtures and glossary | Label repo-only sources as such. Security reports go directly to the existing policy. |
| Index: Specifications and Mission | Brief, guidelines, architecture, ADR, Mission guide | Mark current vs historical; architecture ↔ layout and decision. |
| Mission guide | Design/plan pair, backlog, review passes, skill and prior objective | Label by artifact type; distinguish GitHub/repository documents from the installed package and local operational state. |

## Decisions

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Audience | Both users and maintainers, including Mission readers. | A user-only tutorial or contributor-only cleanup. | The user explicitly requested the whole set, specs and architecture. |
| Organization | A Markdown reader index plus question-specific pages; revise stable spec paths in place. | A hosted docs site or wholesale move to a new tree. | No extra build or hosting, and the preparation tests and existing deep links still work. |
| Spec vs architecture vs decision | Specify observable behavior, explain actual execution separately, record the scanner exception once as a retrospective ADR. | Duplicate the old implementation phases or claim a new architecture is being adopted. | `src/extension.ts` and the scanner code already implement the boundary. |
| Mission scope | A project-specific guide to active specs, decisions, plans, evidence and retained history; link Mission’s own documentation for general operation. | New workflows/configuration, empty templates, fabricated research/review outcomes or a generic Mission installation manual. | The request is to document AnalyseMe and its existing process, not change either. |
| Distribution | Publish top-level reader docs; keep nested design, ADR and task records repository-only. Use the existing dry-run guard. | Disable the specs check, ship all planning artifacts or build a second documentation bundle. | `package.json:files` currently includes `docs/**/*.md`; `scripts/check-package-contents.mjs:forbiddenChecks` rejects nested `/specs/`. |

## Open questions

None. The user selected the full documentation set, including specs, architecture and Mission material. Live Sonar access and a public release are not prerequisites for documenting or checking it.
