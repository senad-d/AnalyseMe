# Contributing to AnalyseMe

## Prepare a checkout

You need Node.js 22.19.0 or newer and npm. Use Pi for interactive development or the separate Pi smoke test. You do not need a Sonar account, token, or scanner for the default validation suite.

From a source checkout, install the locked dependencies, then start Pi with only the local extension explicitly loaded:

```bash
npm ci
npm run dev
```

`npm run dev` runs `pi --no-extensions -e .` from the checkout without changing your installed extensions. In Pi, use `/analyseme help` for setup guidance and `/analyseme` for masked configuration status. These commands do not contact Sonar.

## Make and submit a change

1. Start with the [product brief](docs/PROJECT_DEFINITION_BRIEF.md) and the [engineering guidelines](specs/spec-guidelines.md). Use the [source map](docs/STRUCTURE.md) to find the module and its tests. For changes involving local files, credentials, or uploads, read the [security policy](SECURITY.md).
2. Keep the change focused. If you are following a task checklist, work on one task at a time and mark it complete only after its acceptance criteria are met. See [AGENTS.md](AGENTS.md) and the [Mission guide](docs/MISSION.md) for repository conventions and records.
3. Run [default validation](docs/VALIDATION.md#default-validation) from the root. For changes to Pi loading or command behavior, also run the [isolated Pi smoke test](docs/VALIDATION.md#isolated-pi-smoke-test). [Live read checks](docs/VALIDATION.md#optional-live-sonar-smoke-test) are optional and separate from both.
4. Use the [issue forms](.github/ISSUE_TEMPLATE/) for public bug reports, feature requests, or documentation issues. For a pull request, use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and record the checks you actually ran. Report sensitive issues through the [private reporting route](SECURITY.md#reporting-a-vulnerability).

### Pull request checklist

- Explain the change and link the relevant issue, if any.
- Update the affected docs and examples, and cover behavior changes with relevant tests.
- Record the validation results and any manual checks; note checks you did not run rather than marking them complete.
- Review file, process, network, and credential impacts. Keep secrets, `.env`, local `.pi/` state, dependencies, generated reports, coverage, and package tarballs out of the PR.

## Publishing

**Maintainers only.** A package [dry-run](docs/VALIDATION.md#package-contents-check) checks the file list without publishing. The manual release below publishes `@senad-d/analyseme` to npm; it is not a validation step.

Update and commit [CHANGELOG.md](CHANGELOG.md) before starting. Use a clean working tree with dependencies installed, a Node.js installation with npm, Git, and an npm account authorized to publish the package. Choose a new version that is not already published or tagged. Use a branch rather than a detached checkout if you intend to push through the script.

```bash
npm login
npm whoami
node scripts/publish-npm.mjs
```

The [release script](scripts/publish-npm.mjs) prompts for the version and confirmation. Once confirmed, it runs validation, updates the manifest and lockfile, creates the release commit and `v<version>` tag, and publishes the package publicly. After publishing, it separately asks whether to push the branch and tag to `origin`.

The manually dispatched [GitHub Actions publish workflow](.github/workflows/publish.yml) is a separate release path: it runs on the default branch, reads the version from the checked-in manifest, and uses npm trusted publishing. Do not run both paths for the same version.
