import { SONAR_ENV_VARS, SONAR_PROJECT_PROPERTIES_FILE } from "../constants.ts";
import type { AnalyseMeConfigLoadResult, LoadedConfigValues, ProjectKeyResolution } from "../config/types.ts";
import { maskSecretPresence } from "../utils/mask.ts";

export type ConfigTuiStatus = "Ready" | "Needs setup" | "Needs project";
export type ConfigTuiItemState = "ok" | "missing" | "info" | "warning";

export interface ConfigTuiItem {
  state: ConfigTuiItemState;
  label: string;
  value: string;
}

export interface ConfigTuiSection {
  title: string;
  items?: ConfigTuiItem[];
  lines?: string[];
}

export interface ConfigTuiModel {
  title: string;
  scope: ConfigTuiStatus;
  headline: string;
  summary: string;
  sections: ConfigTuiSection[];
}

export interface ConfigTuiModelOptions {
  projectKey?: ProjectKeyResolution;
}

const WIDE_MIN_WIDTH = 72;
const NARROW_MIN_WIDTH = 24;
const WIDE_LABEL_WIDTH = 16;
const NARROW_LABEL_WIDTH = 13;

export class ConfigTuiComponent {
  private readonly model: ConfigTuiModel;
  private readonly done: () => void;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(model: ConfigTuiModel, done: () => void) {
    this.model = model;
    this.done = done;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    this.cachedWidth = width;
    this.cachedLines = renderConfigTui(this.model, width);

    return this.cachedLines;
  }

  handleInput(data: string): void {
    if (isCloseKey(data)) this.done();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export function buildConfigTuiModel(
  result: AnalyseMeConfigLoadResult,
  options: ConfigTuiModelOptions = {},
): ConfigTuiModel {
  const sources = result.config?.sources ?? result.sources;
  const projectKey = resolveDisplayedProjectKey(sources, options.projectKey);
  const status = resolveStatus(result, projectKey.value);

  return {
    title: "AnalyseMe",
    scope: status,
    headline: statusHeadline(status),
    summary: statusSummary(status),
    sections: buildSections(result, sources, projectKey),
  };
}

export function renderConfigTui(model: ConfigTuiModel, width: number): string[] {
  const safeWidth = Math.max(1, Math.floor(width));

  if (safeWidth < NARROW_MIN_WIDTH) return renderTiny(model, safeWidth);
  if (safeWidth < WIDE_MIN_WIDTH) return renderPanel(model, safeWidth, NARROW_LABEL_WIDTH);

  return renderPanel(model, safeWidth, WIDE_LABEL_WIDTH);
}

interface DisplayedProjectKey {
  value: string | undefined;
}

function buildSections(
  result: AnalyseMeConfigLoadResult,
  sources: LoadedConfigValues | undefined,
  projectKey: DisplayedProjectKey,
): ConfigTuiSection[] {
  const issues = buildIssues(result, projectKey.value);
  const sections = [
    buildConnectionSection(result, sources),
    buildProjectSection(sources, projectKey),
  ];

  if (issues.length > 0) {
    sections.push({ title: "What to fix", lines: issues.map((issue) => `  ! ${issue}`) });
  }

  sections.push({
    title: "Notes",
    lines: ["  q/Esc close"],
  });

  return sections;
}

function buildConnectionSection(
  result: AnalyseMeConfigLoadResult,
  sources: LoadedConfigValues | undefined,
): ConfigTuiSection {
  const url = result.config?.url ?? sources?.[SONAR_ENV_VARS.url]?.value;
  const token = sources?.[SONAR_ENV_VARS.token];

  return {
    title: "Connection",
    items: [
      {
        state: result.config ? "ok" : "missing",
        label: "Sonar URL",
        value: url ?? "missing",
      },
      {
        state: token?.value ? "ok" : "missing",
        label: "API token",
        value: maskSecretPresence(token?.value),
      },
    ],
  };
}

function buildProjectSection(
  sources: LoadedConfigValues | undefined,
  projectKey: DisplayedProjectKey,
): ConfigTuiSection {
  const organization = sources?.[SONAR_ENV_VARS.organization];

  return {
    title: "Project",
    items: [
      {
        state: projectKey.value ? "ok" : "missing",
        label: "Project key",
        value: projectKey.value ?? "not configured",
      },
      {
        state: organization?.value ? "ok" : "info",
        label: "Organization",
        value: organization?.value ?? "optional; not set",
      },
      {
        state: analysisScopeState(sources),
        label: "Analysis scope",
        value: analysisScopeValue(sources),
      },
    ],
  };
}

function resolveDisplayedProjectKey(
  sources: LoadedConfigValues | undefined,
  projectKey: ProjectKeyResolution | undefined,
): DisplayedProjectKey {
  if (projectKey?.projectKey) return { value: projectKey.projectKey };

  const configuredProjectKey = sources?.[SONAR_ENV_VARS.projectKey];
  if (configuredProjectKey?.value) return { value: configuredProjectKey.value };

  return { value: undefined };
}

function resolveStatus(result: AnalyseMeConfigLoadResult, projectKey: string | undefined): ConfigTuiStatus {
  if (result.errors.length > 0 || !result.config) return "Needs setup";
  if (!projectKey) return "Needs project";

  return "Ready";
}

function statusHeadline(status: ConfigTuiStatus): string {
  if (status === "Ready") return "Ready to use";
  if (status === "Needs project") return "Project key missing";

  return "Setup incomplete";
}

function statusSummary(status: ConfigTuiStatus): string {
  if (status === "Ready") return "All required variables and a default project key are configured.";
  if (status === "Needs project") return "Sonar variables are configured, but no default project key was found.";

  return "Required configuration is missing. Fix the items below.";
}

function analysisScopeValue(sources: LoadedConfigValues | undefined): string {
  const branch = sources?.[SONAR_ENV_VARS.branch]?.value;
  const pullRequest = sources?.[SONAR_ENV_VARS.pullRequest]?.value;

  if (branch && pullRequest) return "invalid; branch and pull request both set";
  if (branch) return `branch ${branch}`;
  if (pullRequest) return `pull request ${pullRequest}`;

  return "default project scope";
}

function analysisScopeState(sources: LoadedConfigValues | undefined): ConfigTuiItemState {
  const branch = sources?.[SONAR_ENV_VARS.branch]?.value;
  const pullRequest = sources?.[SONAR_ENV_VARS.pullRequest]?.value;

  if (branch && pullRequest) return "warning";
  return "info";
}

function buildIssues(result: AnalyseMeConfigLoadResult, projectKey: string | undefined): string[] {
  const issues = result.errors.map(shortIssue);

  if (result.config && !projectKey) {
    issues.push(`Set ${SONAR_ENV_VARS.projectKey} or add sonar.projectKey to ${SONAR_PROJECT_PROPERTIES_FILE}.`);
  }

  return issues;
}

function shortIssue(issue: string): string {
  if (issue.includes(SONAR_ENV_VARS.url)) return `Set a valid ${SONAR_ENV_VARS.url}.`;
  if (issue.includes(SONAR_ENV_VARS.token)) return `Set ${SONAR_ENV_VARS.token}.`;
  if (issue.includes(SONAR_ENV_VARS.branch) && issue.includes(SONAR_ENV_VARS.pullRequest)) {
    return `Choose either ${SONAR_ENV_VARS.branch} or ${SONAR_ENV_VARS.pullRequest}, not both.`;
  }

  return issue;
}

function renderPanel(model: ConfigTuiModel, width: number, labelWidth: number): string[] {
  const lines = [topBorder(model.title, model.scope, width)];

  lines.push(fullLine(`${stateMarker(statusState(model.scope))} ${model.headline}`, width));
  lines.push(fullLine(`    ${model.summary}`, width));

  for (const section of model.sections) {
    lines.push(sectionSeparator(section.title, width));

    for (const item of section.items ?? []) {
      lines.push(itemLine(item, width, labelWidth));
    }

    for (const line of section.lines ?? []) {
      lines.push(fullLine(line, width));
    }
  }

  lines.push(bottomBorder(width));

  return fitLines(lines, width);
}

function renderTiny(model: ConfigTuiModel, width: number): string[] {
  const project = findItemValue(model, "Project key") ?? "unknown";

  return fitLines([model.title, model.scope, `Project: ${project}`, "q/Esc close"], width);
}

function findItemValue(model: ConfigTuiModel, label: string): string | undefined {
  for (const section of model.sections) {
    const item = section.items?.find((candidate) => candidate.label === label);
    if (item) return item.value;
  }

  return undefined;
}

function itemLine(item: ConfigTuiItem, width: number, labelWidth: number): string {
  const innerWidth = Math.max(0, width - 2);
  const prefix = `  ${stateMarker(item.state)} `;
  const valueWidth = Math.max(0, innerWidth - prefix.length - labelWidth - 1);
  const label = padRight(clip(item.label, labelWidth), labelWidth);
  const value = clip(item.value, valueWidth);

  return fullLine(`${prefix}${label} ${value}`, width);
}

function statusState(status: ConfigTuiStatus): ConfigTuiItemState {
  if (status === "Ready") return "ok";
  return "warning";
}

function stateMarker(state: ConfigTuiItemState): string {
  if (state === "ok") return "✓";
  if (state === "info") return "·";

  return "!";
}

function topBorder(title: string, scope: string, width: number): string {
  if (width < 2) return clip("╭", width);

  const innerWidth = width - 2;
  const titleText = `─ ${sanitizeText(title)} `;
  const scopeText = ` ${sanitizeText(scope)} ─`;
  const available = Math.max(0, innerWidth - titleText.length - scopeText.length);
  const content = clip(`${titleText}${"─".repeat(available)}${scopeText}`, innerWidth).padEnd(innerWidth, "─");

  return `╭${content}╮`;
}

function sectionSeparator(title: string, width: number): string {
  if (width < 2) return clip("├", width);

  const innerWidth = width - 2;
  const titleText = `─ ${sanitizeText(title)} `;
  const content = clip(`${titleText}${"─".repeat(Math.max(0, innerWidth - titleText.length))}`, innerWidth).padEnd(
    innerWidth,
    "─",
  );

  return `├${content}┤`;
}

function bottomBorder(width: number): string {
  if (width < 2) return clip("╰", width);

  return `╰${"─".repeat(width - 2)}╯`;
}

function fullLine(content: string, width: number): string {
  if (width < 2) return clip(content, width);

  return `│${padRight(clip(content, width - 2), width - 2)}│`;
}

function fitLines(lines: string[], width: number): string[] {
  return lines.map((line) => padRight(clip(line, width), width));
}

function clip(value: string, width: number): string {
  const sanitized = sanitizeText(value);
  if (width <= 0) return "";
  if (sanitized.length <= width) return sanitized;
  if (width === 1) return "…";

  return `${sanitized.slice(0, width - 1)}…`;
}

function sanitizeText(value: string): string {
  let sanitized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127 || codePoint === 155) continue;
    sanitized += character;
  }

  return sanitized;
}

function padRight(value: string, width: number): string {
  return value.padEnd(Math.max(0, width), " ");
}

function isCloseKey(data: string): boolean {
  return data === "q" || data === "Q" || data === "\u001b" || data === "escape";
}
