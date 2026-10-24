# Plan for objective 18

Deliver issue #16 (ci-fix): the failing check it describes blocks other pull requests.

Each task ran as its own chain on its agent; tasks without a dependency ran in parallel.

## Task pin-supported-typescript: Pin TypeScript 6.0.3 without unrelated dependency changes

Agent: devops. Depends on: none.

- `package.json`
- `package-lock.json`

- [ ] Deliver issue #16's manifest/lockfile safeguard as a separate main-based fix, never by changing held PR #13 or its source branch.

#### Why
The issue records npm ERESOLVE and a lint rejection on PR #13 with TypeScript 7.0.2 and typescript-eslint 8.72.0, whose compiler peer range is >=4.8.4 <6.1.0. This checkout instead resolves TypeScript 6.0.3 and typescript-eslint 8.63.0 with that same peer range, but package.json and the lockfile root still request ^6.0.3. An exact pin preserves the supported compiler.

#### How
Read the full cached issue at .pi/issues/16-unblock-13-typescript-7-is-unsupported-by-typescript-eslint.json, its References package-lock.json and .github/workflows/ci.yml, plus CONTRIBUTING.md, docs/VALIDATION.md and eslint.config.js. The issue carries the failure evidence from its other Reference, https://github.com/senad-d/AnalyseMe/pull/13; do not modify or check out that branch to manufacture a reproduction.

Before editing, replay the normal-install/validation reproduction under Node 22.19.0 using npm ci --ignore-scripts and npm run validate. Record actual outcomes: the current compatible lockfile may pass, which does not invalidate the reported PR failure. Establish a fail-first automated policy assertion that both root compiler specifications equal exactly 6.0.3 and the resolved compiler remains 6.0.3; the caret specifications must fail before the fix. Keep auxiliary verification outside the committed three-file issue scope and report its result without claiming it reproduces PR #13's ERESOLVE.

Change only devDependencies.typescript in package.json to 6.0.3 and regenerate package-lock.json consistently with npm. Preserve lockfile v3, the compiler resolution/integrity, all unrelated lock entries, other dependencies and scripts. Choose the regeneration invocation during execution; no new dependency or committed test infrastructure is needed. Preserve two-space JSON formatting, LF and final newline.

#### Where
package.json; package-lock.json.

#### Acceptance criteria
- The fail-first policy assertion passes after the fix; both specifications are exact 6.0.3 and the resolved compiler remains 6.0.3.
- On Node 22.19.0, npm ci --ignore-scripts, npm run validate and npm run smoke:pi each exit 0. Validate includes lint, tests and package checks; smoke is separate and uses placeholders, not live credentials.
- Inspect the change for unrelated dependency churn. Do not apply the seven other PR upgrades, change PR #13, weaken CI/lint, use peer-validation bypasses, remediate audits or change application code.
- The existing CI validation job must pass on the pushed fix branch as workflow proof. Record unavailable evidence as unverified, not as a claim that the held PR head now passes.

#### Dependencies
None. Parallelizable with ignore-unsupported-typescript, which changes only .github/dependabot.yml.

## Task ignore-unsupported-typescript: Prevent Dependabot proposals outside the supported compiler range

Agent: devops. Depends on: none.

- `.github/dependabot.yml`

- [ ] Deliver issue #16's Dependabot safeguard and its explanation in the existing root npm configuration.

#### Why
PR #13's supplied verifier reports that typescript-eslint@8.72.0 requires TypeScript >=4.8.4 <6.1.0 and explicitly rejects TypeScript 7. The current root npm Dependabot entry has development/production groups but no compiler ignore. Prevent repeat proposals without suppressing other updates.

#### How
Read the full cached issue at .pi/issues/16-unblock-13-typescript-7-is-unsupported-by-typescript-eslint.json, its References package-lock.json and .github/workflows/ci.yml, plus .github/dependabot.yml, CONTRIBUTING.md and docs/VALIDATION.md. Its other Reference is held PR https://github.com/senad-d/AnalyseMe/pull/13; use the issue's supplied reproduction evidence without changing that PR or branch. The checkout's linter resolves 8.63.0, not the issue's PR-specific 8.72.0; do not upgrade it.

Before editing, establish an automated structural assertion that the npm update item for directory / contains dependency-name typescript with versions [">=6.1.0"]. It must fail on the current missing ignore and pass afterward. Keep auxiliary verification outside the committed issue scope; do not add a YAML dependency or test framework. Check parsed structure, not merely matching text: scripts/check-format.mjs checks YAML whitespace but not YAML semantics.

Add that ignore within the existing root npm update item, alongside its configuration. Explain beside it that typescript-eslint@8.72.0 requires >=4.8.4 <6.1.0 and explicitly rejects TypeScript 7, and that the pin/ignore should be revisited when upstream supports newer compilers. Preserve both npm dependency groups, scheduling, labels, limits and commit-message configuration, and preserve the entire separate GitHub Actions update entry. Use existing two-space YAML formatting, LF and final newline. Keep the explanation here rather than creating separate documentation.

#### Where
.github/dependabot.yml.

#### Acceptance criteria
- Structural assertion passes for the exact dependency/range under the root npm item; comparison with the baseline confirms other groups/settings and the Actions item are unchanged.
- The adjacent comment contains the named upstream constraint and revisit condition.
- On Node 22.19.0, install with npm ci --ignore-scripts and run npm run validate successfully; report the structural check separately from formatting. Existing CI must pass on the pushed fix branch as workflow proof; do not claim the formatter validates Dependabot semantics or that an actual future bot run was observed.
- This is a separate main-based fix. Leave PR #13 and its branch unchanged; do not apply its other upgrades, bypass peers, weaken CI/lint, change workflows, remediate audits or alter application code.

#### Dependencies
None. Parallelizable with pin-supported-typescript: this task does not change manifests, and the current lockfile already resolves a supported compiler. The manifest task owns the pinned arrangement's additional Pi smoke acceptance.
