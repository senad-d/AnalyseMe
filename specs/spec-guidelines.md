# AnalyseMe Engineering Guidelines

## Implementation constraints

- **Registration and lifecycle.** Keep TypeScript ESM modules small, with explicit `.ts` imports and type-only imports for types. Follow [repository conventions](../AGENTS.md), including avoiding nested functions. Keep [`src/extension.ts`](../src/extension.ts) a thin entry point that delegates to typed command, tool, and lifecycle registrations. Do not start background work in the factory. Dispose of any session-scoped resources when their work ends or the session shuts down. The current [lifecycle hooks](../src/events/lifecycle.ts) only clear stale UI status on start and shutdown when UI is available.
- **Module boundaries.** Resolve connection, project key, and analysis scope in configuration code; share resolution across tools. Construct endpoint paths and supported query parameters in [`src/sonar/endpoints.ts`](../src/sonar/endpoints.ts), not in renderers. Keep transport and defensive response mapping separate from tool schemas and result rendering. Use Git metadata only for diagnostics, never as an authoritative project key. See the [as-built architecture](spec-architecture.md).
- **Packaging.** Keep the identity, `pi.extensions` entry, and runtime peer declarations in [`package.json`](../package.json) aligned with Pi loading. The declared peers are `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`. Keep development-only dependencies separate. Preserve the explicit package allowlist: ship top-level reader docs, not root `specs/`, nested documentation records, credentials, or local `.pi/` state.

## Tool and UI contracts

### Read tools and scanner

- Declare each tool with a TypeBox schema, descriptive parameter help, a `promptSnippet`, and `promptGuidelines` that name the tool explicitly. Keep those declarations and the [tool reference](../docs/TOOLS.md) in sync. Use the shared resolution rules; do not silently combine branch and pull request scope or add scope or organization parameters to endpoints that do not accept them.
- Route retrieval through the [GET client](../src/sonar/client.ts), using endpoint-relative paths, Node `fetch`, and caller cancellation. Preserve request timeouts, response-body limits, and bounded list pages. Do not add mutation endpoints or shell out for HTTP. Throw actionable, redacted errors for failed required reads; keep optional source or guidance failures visible as warnings without swallowing cancellation. Do not invent missing Sonar guidance.
- Keep scanning behind the explicit [`analyseme_run_scan` tool](../src/tools/run-scan.ts). It runs sequentially and [spawns the configured scanner](../src/scan/scanner.ts) in the project directory without a shell. Keep the URL and token in the subprocess environment (`SONAR_HOST_URL`, `SONAR_TOKEN`), not arguments; reject connection and credential overrides in extra properties. Preserve timeout and cancellation handling and bounded, sanitized, redacted log tails. Missing scanner errors give installation guidance, not automatic installation. Report nonzero exits and timeouts as scanner outcomes in the returned result; do not confuse process success, upload evidence, and server processing.

### Output and secrets

- Treat `SONARQUBE_TOKEN` and derived authentication values as secrets. Never print, log, persist, or return them in rendered output, structured details, or error text. Show token presence only in local status; do not echo raw `.env` contents. Use the shared [masking and redaction helpers](../src/utils/mask.ts). Never put credentials in extra scanner properties; scanner arguments appear in result details.
- Return concise `content` and purpose-built `details`, not raw server payloads. Sanitize external text for terminal output, bound individual fields as well as rendered output, and retain visible truncation notices and structured metadata. Treat snippets and other finding data as sensitive even after sanitization. See the [security policy](../SECURITY.md).

### Read-only configuration panel

Use the [generic configuration TUI standard](spec-configuration-tui-design-standard.md) for the visual conventions that apply: themed frames, wide two-pane and narrow one-pane layouts, a borderless tiny fallback, selection markers, and width-safe rendering. AnalyseMe adapts that standard to a status panel, not an editor. The [implemented panel](../src/ui/config-tui.ts) uses Up/Down to navigate sections and close keys to exit; there is no Tab pane switching, edit, search, or save/cancel flow. It shows category descriptions and item counts rather than editable-setting hints and position counters. `/analyseme help` stays text-only, and `/analyseme` uses non-interactive rendering outside TUI mode. Neither form writes `.env` or checks the server.

## Evidence for changes

Use the [product brief](../docs/PROJECT_DEFINITION_BRIEF.md) for observable requirements, the [contributor guide](../CONTRIBUTING.md) for workflow, and the [validation guide](../docs/VALIDATION.md) for commands. Choose checks that exercise the change:

| Change | Evidence to update or run |
| --- | --- |
| Registration, schema, or lifecycle | [Public surface contract](../test/public-surface-contract.test.mjs) and [lifecycle tests](../test/lifecycle.test.mjs) |
| Configuration precedence, masking, or command and panel behavior | [Configuration tests](../test/config.test.mjs), [command tests](../test/analyseme-command.test.mjs), and [TUI tests](../test/config-tui.test.mjs); `npm run smoke:pi` for isolated Pi command loading and output |
| Read transport, mapping, or failure behavior | [Client tests](../test/sonar-client.test.mjs), [fixture tests](../test/sonar-compatibility-fixtures.test.mjs), the affected tool tests, and the [read error contract](../test/tool-error-contract.test.mjs) |
| Scan process, properties, or outcomes | [Scanner tool tests](../test/run-scan-tool.test.mjs) with a local stand-in for the scanner |
| Package or specification paths | [Preparation checks](../test/preparation.test.mjs), including spec identity assertions, and `npm run check:pack` |

Run `npm run validate` before handoff or release, and record what actually ran and any limits in the [pull request validation checklist](../.github/PULL_REQUEST_TEMPLATE.md). Keep default tests independent of live Sonar credentials. Fixture and stand-in scanner tests verify behavior under controlled inputs; they do not prove compatibility or submission on a live server.
