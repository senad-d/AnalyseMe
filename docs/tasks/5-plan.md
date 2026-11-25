# Reorganize the AnalyseMe documentation

## Request coverage

| Request or addition | Delivery and reason |
| --- | --- |
| “Create docs for AnalyseMe.” | Tasks 2–7 deliver a connected documentation set for users, contributors and maintainers. |
| “I need evrithing about documentation reorganized” | Tasks 2–7 give each subject one home, preserve existing entry points, and distinguish current guides, policies, reference material and historical records. |
| “I also need specs” | Task 5 refreshes the product and engineering specifications against the implemented extension, including the read-only adaptation of the existing TUI standard. |
| “arhitecture” | Task 6 explains the running system, its modules, request and scan paths, and why the read/write boundary exists. |
| “and anithing else that comes with mission” | Task 7 maps the glossary, decisions, design documents, plans, verification, handoffs, backlog and dated reviews to their roles in this repository. |
| Reader index, worked inspection and lookup pages | Tasks 2–3 make the reorganization usable: start with one finding, then find configuration, commands, tools or recovery steps without reading an architectural plan. |
| Retrospective decision record | Task 6 gives a durable, source-backed home to the decision most easily misread in the existing docs: reading findings vs submitting analysis. |
| Package documentation selection | Task 1 is necessary because the existing broad documentation glob includes this Mission design under `docs/specs/`, but the existing package check forbids publishing specs. No change to runtime or dependencies. |

Work kind: **documentation**. Plan revision: 2. The design’s **Pages today**, **Decisions** and **Open questions** record the baseline, choices and scope answer. No external account is required to deliver or verify the docs; the tutorial distinguishes illustrative data from a real Sonar query.

## Contracts

**Reader routes** (documentation interface; no runtime API changes). The following are canonical repo-relative targets. Each page owner creates the indicated targets; other tasks link to them without editing the destination. A route without a fragment is a page-level link.

| Reader intent | Target(s) |
| --- | --- |
| First inspection / choose a reader path | `README.md#quick-start`; `docs/README.md#use-analyseme`, `docs/README.md#contribute`, `docs/README.md#specifications-and-mission` |
| Configure / recover / maintain an installation | `docs/SETUP.md#install`, `docs/SETUP.md#configure-locally`, `docs/SETUP.md#use-in-ci`, `docs/SETUP.md#troubleshooting`, `docs/SETUP.md#update-and-uninstall` |
| Commands, tool inputs and results / explicit upload | `docs/TOOLS.md`, `docs/TOOLS.md#submitting-a-scan` |
| Develop / validate / publish / report sensitive information | `CONTRIBUTING.md`, `docs/VALIDATION.md`, `CONTRIBUTING.md#publishing`, `SECURITY.md` |
| What it does / implementation rules / generic UI standard | `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-guidelines.md`, `specs/spec-configuration-tui-design-standard.md` |
| Where code lives / how it runs / why scanning is distinct | `docs/STRUCTURE.md`, `specs/spec-architecture.md`, `docs/adr/0001-sonar-scan-boundary.md` |
| Mission and records | `docs/MISSION.md`, `CONTEXT.md`, `AGENTS.md`, `docs/specs/analyseme-documentation.md`, `docs/tasks/5-plan.md`; other retained records are listed in the design’s Mission page outline. |

README legacy targets to retain as headings or named anchors: `#quick-start`, `#installation`, `#configuration`, `#commands-and-tools`, `#troubleshooting`, `#development-and-validation`, `#update-and-uninstall`, `#publishing`, `#license`. A short pointer suffices when the chapter moves.

**Package boundary** (file/link contract). `package.json` replaces the single `docs/**/*.md` entry in `files` with `docs/*.md`. All top-level Markdown pages in `docs/` ship, including the hub and the user guides. Nested `docs/specs/`, `docs/tasks/`, `docs/adr/`, root `specs/`, `.pi/`, `CONTRIBUTING.md`, repository tests, skill and agent instructions are not installed documentation. Keep all other package entries and deny checks unchanged.

Use relative links for destinations present with the referring page. From a shipped page to a repository-only page use a labeled repository link based on `https://github.com/senad-d/analyseme/blob/main/` plus its exact path and optional fragment; for directories use `tree/main/`. Check new targets against the checkout before merge, not the old `main`. For README images not in the package, use a repository-backed image URL without changing the image. For local Mission configuration name the path as code; do not link or publish local state. No coming-soon targets.

## File ownership

| Owner | Only this task edits |
| --- | --- |
| 1 | `package.json` (`files` only) |
| 2 | `README.md`, `docs/README.md` (shared entry points) |
| 3 | `docs/SETUP.md`, `docs/TOOLS.md` |
| 4 | `CONTRIBUTING.md`, `docs/VALIDATION.md`, `SECURITY.md` |
| 5 | `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-guidelines.md` |
| 6 | `docs/STRUCTURE.md`, `specs/spec-architecture.md`, `docs/adr/0001-sonar-scan-boundary.md` |
| 7 | `docs/MISSION.md` |

Existing records and templates not listed above stay in place, including prior task checkboxes. The design and this plan are inputs, not new manuals to duplicate. No task edits runtime code, tests, CI, the lockfile or Mission settings.

## Verification

- Walk the operator path from README → setup → masked status/help → summary → bounded list → detail. Use the documented `npm run smoke:pi` for the offline Pi commands; compare the example project, key and location to `test/fixtures/sonar-api/sonarqube-10.6-core.json`. Do not query live Sonar or upload a scan.
- From the index, follow the contributor route to local development and validation, then locate both read and scan implementations from the architecture. Follow the Mission route to a current spec, its decision, the actual objective 5 design/plan and each historical record; check that their labels match their contents.
- Resolve changed links and fragments, including the nine legacy README destinations. Check relative links from each published page against `npm run pack:dry-run`’s file list; verify repository links against the corresponding path/heading in the checkout. Do not treat the formatter as a link check.
- Compare the described command and six tools/parameters to `test/public-surface-contract.test.mjs` and the registrations; compare scanner prerequisites, side effects and errors to `src/tools/run-scan.ts` and `src/scan/scanner.ts`. The brief, specs, README, policy and validation guide must agree.
- Run the documented `npm run validate` from the repository root: the path/content checks in `test/preparation.test.mjs` and the original `npm run check:pack` guard must pass. Confirm the package includes the top-level reader pages, excludes planning records, and no new server, credential, deployment or publication is required.

### 1. Keep repository planning records out of the npm package

- [ ] Narrow the published Markdown selection to the reader-facing level while preserving the existing package guard.

#### Why

This Mission design is under `docs/specs/`. The current `files` glob admits it, while `scripts/check-package-contents.mjs` rejects any packed path containing `/specs/`. Until the two agree, the normal `npm run validate` gate cannot pass for any documentation change in this checkout.

#### References

`docs/specs/analyseme-documentation.md#decisions` — documentation distribution boundary.

`scripts/check-package-contents.mjs` — existing dry-run and forbidden-file checks.

#### How

Depends on: none. Implement **Package boundary** in the manifest’s `files` list only. Use the documented dry-run/check before and after the edit to establish which documentation ships. Keep root metadata and runtime entries, scripts, dependencies, lockfile and deny rules untouched; no publish or version bump.

#### Where

`package.json`

#### Acceptance criteria

- `npm run check:pack` passes with the Mission design in the checkout. The dry-run lists top-level Markdown under `docs/` but no root `specs/`, nested planning/decision/task records or `.pi/` state.
- Runtime package entries and public metadata other than the documentation inclusion pattern are unchanged.

### 2. Walk a new Pi user from installation to one finding

- [ ] Turn the README into a short first inspection and add the reader index at `docs/README.md`.

#### Why

The existing README names the tools but its quick start stops at a prompt and shares the page with release procedures. A new user should know what to do with a returned key and where to look next.

#### References

`docs/specs/analyseme-documentation.md#readmemd` — tutorial and fixture-backed outcome.

`docs/specs/analyseme-documentation.md#docsreadmemd` — the three reader paths.

`docs/specs/analyseme-documentation.md#navigation` — current docs vs history.

#### How

Depends on: Task 1. Apply **Reader routes** and **Package boundary**. Preserve the identity, demo, security warning and license. Use the existing install/start/status commands, distinguish local status from live data, and show how one returned issue key leads to its location. If a bounded page has no active rows, describe that page, not the whole project; use pagination and warnings to tell an empty result from an incomplete one. Route detailed setup, release and reference topics to their named owners; preserve old anchors. Populate the reader index with direct, labeled destinations, not another tutorial.

#### Where

`README.md`

`docs/README.md`

#### Acceptance criteria

- From the first screenful a reader can start the tutorial or open the documentation index. The tutorial ends at the verified illustrative location, makes no claim that the example is live and does not require a scan.
- All three reader paths have actionable links. The old README anchors still lead somewhere useful; full setup tables, troubleshooting and release procedures are not duplicated in it.

### 3. Make setup and tool behavior searchable

- [ ] Create the operator how-to at `docs/SETUP.md` and the command/tool reference at `docs/TOOLS.md`.

#### Why

Someone diagnosing the wrong project needs a precedence rule, not a tutorial. Someone calling a tool needs its actual inputs, outputs and side effects, not just its name.

#### References

`docs/specs/analyseme-documentation.md#docssetupmd` — install/configuration, common failures and removal.

`docs/specs/analyseme-documentation.md#docstoolsmd` — tool fields, limits and examples.

`test/public-surface-contract.test.mjs` — registered identifiers and schema fields.

#### How

Depends on: Task 1. Use **Reader routes** and **Package boundary**. Carry the useful installation variants, placeholder `.env` and Actions examples, diagnosis and update/uninstall guidance across from the baseline README. Ground the reference in the TypeBox schemas, result types and failure tests. In particular, distinguish a keyed lookup from a project query, command from tool, issue from hotspot, and scanner subprocess from GET request. Keep reference facts here and link back to the tutorial/security policy.

#### Where

`docs/SETUP.md`

`docs/TOOLS.md`

#### Acceptance criteria

- A reader can select the right install scope, resolve a project/branch/PR conflict, supply the scanner path correctly and recognize missing permissions or delayed server processing without exposing a token.
- Status/help and all six registered tools are findable. Each tool has a valid sample, required/optional inputs, relevant defaults/bounds, result interpretation and read/submit effect. Empty, partial, truncated and failed results are not presented as equivalent.
- The operator can tell what is safe offline and what needs a real analyzed project or an explicit scanner submission.

### 4. Give contributors one path from checkout to validation

- [ ] Reorganize contributor, validation and security guidance around making, checking and safely submitting a change.

#### Why

The current contributor inventory misses the scanner and the validation guide treats the smoke script’s five expected read-tool names as the full registry. Release steps are mixed into user onboarding.

#### References

`docs/specs/analyseme-documentation.md#contributingmd` — local development, contribution and maintainer release path.

`docs/specs/analyseme-documentation.md#docsvalidationmd` — what each check actually proves.

`docs/specs/analyseme-documentation.md#securitymd` — security/reporting policy and scanner exception.

#### How

Depends on: Task 1. Use **Reader routes** and **Package boundary**. Move existing contributor/publishing instructions to their owner; reference the manifest, package check, Pi smoke and registry tests directly. Retain private reporting and fact-check file/network/credential boundaries against the scanner and GET client. Keep the existing fixture matrix and targeted check registry intact; link them instead of copying. Do not introduce new commands or perform a release.

#### Where

`CONTRIBUTING.md`

`docs/VALIDATION.md`

`SECURITY.md`

#### Acceptance criteria

- A contributor can find prerequisites, the existing isolated local start, offline validation, separate Pi smoke, optional live checks and the PR checklist. Publishing is marked as maintainer-only, not part of validation.
- Validation distinguishes the smoke assertions from the six-tool registry test and synthetic compatibility data from a live guarantee.
- The security policy distinguishes read-only retrieval from scanner upload/work files, explains secret handling and retains a private reporting route.

### 5. Specify the implemented product and engineering constraints

- [ ] Refresh the approved brief and engineering guidelines as current, source-backed specifications at their existing paths.

#### Why

The old brief records local bootstrap paths and omits scanner submission. A maintainer needs to distinguish externally observable requirements from the constraints on implementing them.

#### References

`docs/specs/analyseme-documentation.md#docsproject_definition_briefmd` — product scope, guarantees and evidence.

`docs/specs/analyseme-documentation.md#specsspec-guidelinesmd` — engineering constraints and applicability of the generic TUI standard.

`test/preparation.test.mjs` — stable specification paths and identity assertions.

#### How

Depends on: Task 1. Follow **Reader routes** and **Package boundary**. Rewrite the brief around reader needs, constraints and observable results; give each requirement group its implementation/test evidence. Revise prospective phases in the guidelines into constraints that apply to changes today. Link the as-built architecture, tool schemas, glossary and original generic TUI standard; explicitly distinguish implemented read-only navigation from generic edit/search/save suggestions. Do not turn the backlog into requirements or edit its statuses.

#### Where

`docs/PROJECT_DEFINITION_BRIEF.md`

`specs/spec-guidelines.md`

#### Acceptance criteria

- The product spec identifies the actual package, command, read capabilities and optional scan, and states non-goals, trust boundaries and evidence without template paths or unsupported promises.
- The engineering spec identifies secret handling for `SONARQUBE_TOKEN`, read-client vs scanner constraints, UI applicability and applicable checks. The original preparation assertions still have meaningful content to match.

### 6. Explain the running architecture and its scan boundary

- [ ] Replace the prospective architecture with an as-built explanation, refresh the module map and record the existing scanner decision.

#### Why

The current architecture describes implementation phases. Its GET-only model cannot explain which component runs a scanner, how credentials cross that boundary, or when fresh results are available.

#### References

`docs/specs/analyseme-documentation.md#specsspec-architecturemd` — flows, failure cases and trust boundaries.

`docs/specs/analyseme-documentation.md#docsstructuremd` — path-to-responsibility reference.

`docs/specs/analyseme-documentation.md#docsadr0001-sonar-scan-boundarymd` — decision and consequences to preserve.

#### How

Depends on: Task 1. Use **Reader routes** and **Package boundary**. Trace a read and an explicit scan from `src/extension.ts` to their results using actual symbols; explain who initiates I/O and owns each failure. Keep file lookup in the structure guide. Add only the retrospective decision at the contracted ADR path, citing implementation and changelog rather than inventing an approval or redesigning the system.

#### Where

`specs/spec-architecture.md`

`docs/STRUCTURE.md`

`docs/adr/`

#### Acceptance criteria

- The architecture traces registration/status, config and scope, GET/mapping/optional enrichment, and CLI/upload/async processing through to bounded results. A reader can find the responsible modules and their checks in the module map.
- The architecture names SonarQube/SonarCloud; the ADR explains the choice and its limits without implying issue mutation, background scanning or guaranteed pristine scanner work directories. No bootstrap phases remain presented as the current design.

### 7. Explain how Mission work is recorded in AnalyseMe

- [ ] Create `docs/MISSION.md` as a guide to the project’s Mission workflow and its records.

#### Why

A plan with checkboxes, a dated review, a product specification and a completed handoff answer different questions. Today these documents are scattered, and the old plans can be mistaken for the current product contract.

#### References

`docs/specs/analyseme-documentation.md#docsmissionmd` — workflow sources, artifact map and worked example.

`docs/specs/analyseme-documentation.md#pages-today` — inventory of current guidance and records to retain.

`AGENTS.md` — project task format and acceptance rule.

#### How

Depends on: Task 1. Use **Reader routes** and **Package boundary**. Explain one change moving from request to design, plan, implementation and evidence; use this objective’s design and plan for the part that actually exists. Distinguish what is committed from what travels in a Mission handoff. Link each retained review/backlog, prior plan, skill, glossary, current specs, decision and check registry by purpose. Use the shipped Mission sources identified in the design for workflow semantics; do not copy local `.pi/` state, expose settings, or build a new workflow.

#### Where

`docs/MISSION.md`

#### Acceptance criteria

- A maintainer can find where to put a new spec, design decision and executable task plan, what a task needs for acceptance, and where to look for the actual outcome or a pending question.
- The objective 5 design/plan pair, three dated reviews, implementation backlog, prior Mission plan and repository skill are distinguished from the current product surface; no historical record or checkbox was rewritten.
