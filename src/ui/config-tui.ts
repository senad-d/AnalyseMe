import { SONAR_ENV_VARS, SONAR_PROJECT_PROPERTIES_FILE } from "../constants.ts";
import { isInsecureSonarHttpUrl } from "../config/load-config.ts";
import type { AnalyseMeConfigLoadResult, LoadedConfigValues, ProjectKeyResolution } from "../config/types.ts";
import { maskSecretPresence } from "../utils/mask.ts";

export type ConfigTuiStatus = "Ready" | "Needs setup" | "Needs project";
export type ConfigTuiItemState = "ok" | "missing" | "info" | "warning";
export type ConfigTuiFocus = "categories" | "settings";
export type ConfigTuiNarrowView = "categories" | "settings";

export interface ConfigTuiSetting {
  state: ConfigTuiItemState;
  label: string;
  value: string;
  description: string;
}

export interface ConfigTuiCategory {
  title: string;
  description: string;
  settings: ConfigTuiSetting[];
}

export interface ConfigTuiModel {
  title: string;
  scope: ConfigTuiStatus;
  headline: string;
  summary: string;
  sourceLine: string;
  categories: ConfigTuiCategory[];
  initialCategoryIndex: number;
}

export interface ConfigTuiModelOptions {
  projectKey?: ProjectKeyResolution;
}

export interface ConfigTuiViewState {
  focus?: ConfigTuiFocus;
  categoryIndex?: number;
  settingIndexes?: number[];
  narrowView?: ConfigTuiNarrowView;
  statusText?: string;
  searchText?: string;
}

interface DisplayedProjectKey {
  value: string | undefined;
}

interface ResolvedConfigTuiViewState {
  focus: ConfigTuiFocus;
  categoryIndex: number;
  settingIndexes: number[];
  selectedSettingIndex: number;
  narrowView: ConfigTuiNarrowView;
  statusText: string | undefined;
  searchText: string | undefined;
}

type ConfigTuiInputAction = "up" | "down" | "close" | "ignore";

const WIDE_MIN_WIDTH = 72;
const NARROW_MIN_WIDTH = 24;
const MAX_VISIBLE_SETTING_ROWS = 10;
const HELP_TEXT = "↑↓ section  q quit";
const FOOTER_SEPARATOR = " • ";

export class ConfigTuiComponent {
  private readonly model: ConfigTuiModel;
  private readonly done: () => void;
  private readonly state: ResolvedConfigTuiViewState;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(model: ConfigTuiModel, done: () => void) {
    this.model = model;
    this.done = done;
    this.state = resolveViewState(model);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    this.cachedWidth = width;
    this.cachedLines = renderConfigTui(this.model, width, this.state);

    return this.cachedLines;
  }

  handleInput(data: string): void {
    const action = inputAction(data);

    if (action === "close") {
      this.done();
      return;
    }

    if (action === "up") {
      this.moveCategory(-1);
      return;
    }

    if (action === "down") {
      this.moveCategory(1);
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private moveCategory(delta: number): void {
    const categoryCount = this.model.categories.length;
    this.state.categoryIndex = wrapIndex(this.state.categoryIndex + delta, categoryCount);
    this.state.selectedSettingIndex = selectedSettingIndex(this.model, this.state);
    this.invalidate();
  }

}

export function buildConfigTuiModel(
  result: AnalyseMeConfigLoadResult,
  options: ConfigTuiModelOptions = {},
): ConfigTuiModel {
  const sources = result.config?.sources ?? result.sources;
  const projectKey = resolveDisplayedProjectKey(sources, options.projectKey);
  const status = resolveStatus(result, projectKey.value);

  const categories = buildCategories(result, sources, projectKey);

  return {
    title: "AnalyseMe",
    scope: status,
    headline: statusHeadline(status),
    summary: statusSummary(status),
    sourceLine: "read-only status • environment and local .env may apply",
    categories,
    initialCategoryIndex: initialCategoryIndex(categories),
  };
}

export function renderConfigTui(model: ConfigTuiModel, width: number, state?: ConfigTuiViewState): string[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const viewState = resolveViewState(model, state);

  if (safeWidth < NARROW_MIN_WIDTH) return renderTiny(model, safeWidth, viewState);
  if (safeWidth < WIDE_MIN_WIDTH) return renderNarrow(model, safeWidth, viewState);

  return renderWide(model, safeWidth, viewState);
}

function buildCategories(
  result: AnalyseMeConfigLoadResult,
  sources: LoadedConfigValues | undefined,
  projectKey: DisplayedProjectKey,
): ConfigTuiCategory[] {
  const issues = buildIssues(result, projectKey.value);
  const categories = [buildConnectionCategory(result, sources), buildProjectCategory(sources, projectKey)];

  if (issues.length > 0) categories.push(buildActionCategory(issues));

  return categories;
}

function initialCategoryIndex(categories: ConfigTuiCategory[]): number {
  const actionIndex = categories.findIndex((category) => category.title === "What to fix");
  if (actionIndex !== -1) return actionIndex;

  return 0;
}

function buildConnectionCategory(
  result: AnalyseMeConfigLoadResult,
  sources: LoadedConfigValues | undefined,
): ConfigTuiCategory {
  const url = result.config?.url ?? sources?.[SONAR_ENV_VARS.url]?.value;
  const token = sources?.[SONAR_ENV_VARS.token];

  return {
    title: "Connection",
    description: "Sonar endpoint and masked API token status.",
    settings: [
      {
        state: sonarUrlState(result, url),
        label: "Sonar URL",
        value: sonarUrlValue(result, url),
        description: sonarUrlDescription(result, url),
      },
      {
        state: token?.value ? "ok" : "missing",
        label: "API token",
        value: maskSecretPresence(token?.value),
        description: "Token presence is masked; the raw SONARQUBE_TOKEN value is never displayed.",
      },
    ],
  };
}

function buildProjectCategory(
  sources: LoadedConfigValues | undefined,
  projectKey: DisplayedProjectKey,
): ConfigTuiCategory {
  const organization = sources?.[SONAR_ENV_VARS.organization];

  return {
    title: "Project",
    description: "Default project key, organization, and analysis scope.",
    settings: [
      {
        state: projectKey.value ? "ok" : "missing",
        label: "Project key",
        value: projectKey.value ?? "not configured",
        description: `Set ${SONAR_ENV_VARS.projectKey} or sonar.projectKey when tools need a default project.`,
      },
      {
        state: organization?.value ? "ok" : "info",
        label: "Organization",
        value: organization?.value ?? "optional; not set",
        description: "Required only for SonarCloud organizations that need an organization parameter.",
      },
      {
        state: analysisScopeState(sources),
        label: "Analysis scope",
        value: analysisScopeValue(sources),
        description: "Use either a branch or pull request scope; omit both for default project scope.",
      },
    ],
  };
}

function buildActionCategory(issues: string[]): ConfigTuiCategory {
  return {
    title: "What to fix",
    description: "Local setup issues and warnings detected before any Sonar network call.",
    settings: issues.map(actionSetting),
  };
}

function actionSetting(issue: string, index: number): ConfigTuiSetting {
  return {
    state: "warning",
    label: actionSettingLabel(issue, index),
    value: actionSettingValue(issue),
    description: issue,
  };
}

function actionSettingLabel(issue: string, index: number): string {
  if (issue.includes("non-TLS HTTP")) return "HTTP warning";
  if (issue.includes(".env")) return ".env file";
  if (issue.includes("Git diagnostics")) return "Git diagnostics";
  if (issue.includes(SONAR_ENV_VARS.url)) return SONAR_ENV_VARS.url;
  if (issue.includes(SONAR_ENV_VARS.token)) return SONAR_ENV_VARS.token;
  if (issue.includes(SONAR_ENV_VARS.projectKey)) return "Project key";
  if (issue.includes(SONAR_PROJECT_PROPERTIES_FILE)) return "Project file";
  if (issue.includes(SONAR_ENV_VARS.branch) || issue.includes(SONAR_ENV_VARS.pullRequest)) return "Analysis scope";

  return `Action ${index + 1}`;
}

function actionSettingValue(issue: string): string {
  if (issue.includes("non-TLS HTTP")) return "non-TLS";
  if (issue.includes("missing") || issue.includes("Missing") || issue.includes("Set ")) return "missing";

  return "review";
}

function sonarUrlState(result: AnalyseMeConfigLoadResult, url: string | undefined): ConfigTuiItemState {
  if (!result.config) return url ? "warning" : "missing";
  if (isInsecureSonarHttpUrl(url)) return "warning";

  return "ok";
}

function sonarUrlValue(result: AnalyseMeConfigLoadResult, url: string | undefined): string {
  if (!url) return "missing";
  if (result.config && isInsecureSonarHttpUrl(url)) return `${url} (non-TLS HTTP allowed)`;

  return url;
}

function sonarUrlDescription(result: AnalyseMeConfigLoadResult, url: string | undefined): string {
  if (!url) return `Set a valid ${SONAR_ENV_VARS.url} before using AnalyseMe tools.`;
  if (result.config && isInsecureSonarHttpUrl(url)) return "HTTP is explicitly allowed; prefer HTTPS for tokens.";

  return "Base SonarQube or SonarCloud URL used by read-only tools.";
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
  const issues = [...result.errors.map(shortIssue), ...result.warnings];

  if (result.config && !projectKey) {
    issues.push(`Set ${SONAR_ENV_VARS.projectKey} or add sonar.projectKey to ${SONAR_PROJECT_PROPERTIES_FILE}.`);
  }

  return issues;
}

function shortIssue(issue: string): string {
  if (issue.includes("non-TLS HTTP")) return issue;
  if (issue.includes(SONAR_ENV_VARS.url)) return `Set a valid ${SONAR_ENV_VARS.url}.`;
  if (issue.includes(SONAR_ENV_VARS.token)) return `Set ${SONAR_ENV_VARS.token}.`;
  if (issue.includes(SONAR_ENV_VARS.branch) && issue.includes(SONAR_ENV_VARS.pullRequest)) {
    return `Choose either ${SONAR_ENV_VARS.branch} or ${SONAR_ENV_VARS.pullRequest}, not both.`;
  }

  return issue;
}

function renderWide(model: ConfigTuiModel, width: number, state: ResolvedConfigTuiViewState): string[] {
  const leftPaneWidth = wideLeftPaneWidth(width);
  const rightPaneWidth = Math.max(10, width - leftPaneWidth - 3);
  const categoryRows = renderCategoryRows(model, state, leftPaneWidth);
  const settingRows = renderSettingsPaneRows(selectedCategory(model, state), state, rightPaneWidth);
  const bodyHeight = Math.max(categoryRows.length, settingRows.length, 8);
  const lines = [topBorder(model.title, model.scope, width)];

  lines.push(fullLine(model.sourceLine, width));
  lines.push(fullLine(HELP_TEXT, width));
  lines.push(wideSeparator(leftPaneWidth, rightPaneWidth, "top"));
  lines.push(...renderWideBodyRows(categoryRows, settingRows, bodyHeight));
  lines.push(wideSeparator(leftPaneWidth, rightPaneWidth, "bottom"));
  lines.push(fullLine(footerText(model, state), width));
  lines.push(bottomBorder(width));

  return fitLines(lines, width);
}

function renderNarrow(model: ConfigTuiModel, width: number, state: ResolvedConfigTuiViewState): string[] {
  const rows = renderSettingsPaneRows(selectedCategory(model, state), state, width - 2);
  const lines = [topBorder(model.title, model.scope, width)];

  lines.push(fullLine(model.sourceLine, width));
  lines.push(fullLine(HELP_TEXT, width));
  lines.push(narrowSeparator(width));
  lines.push(...rows.map((row) => fullLine(row, width)));
  lines.push(narrowSeparator(width));
  lines.push(fullLine(footerText(model, state), width));
  lines.push(bottomBorder(width));

  return fitLines(lines, width);
}

function renderTiny(model: ConfigTuiModel, width: number, state: ResolvedConfigTuiViewState): string[] {
  const setting = selectedSetting(model, state);
  const label = setting?.label ?? selectedCategory(model, state).title;
  const value = setting?.value ?? model.scope;

  return fitLines([model.title, model.scope, `${label}: ${value}`, "q quit"], width);
}

function renderWideBodyRows(categoryRows: string[], settingRows: string[], bodyHeight: number): string[] {
  const lines: string[] = [];

  for (let index = 0; index < bodyHeight; index += 1) {
    const left = categoryRows[index] ?? " ".repeat(categoryRows[0]?.length ?? 0);
    const right = settingRows[index] ?? " ".repeat(settingRows[0]?.length ?? 0);
    lines.push(`│${left}│${right}│`);
  }

  return lines;
}

function renderCategoryRows(
  model: ConfigTuiModel,
  state: ResolvedConfigTuiViewState,
  paneWidth: number,
): string[] {
  return model.categories.map((category, index) => renderCategoryRow(category, index === state.categoryIndex, paneWidth));
}

function renderCategoryRow(category: ConfigTuiCategory, selected: boolean, paneWidth: number): string {
  const prefix = selected ? "▶ " : "  ";
  const labelWidth = Math.max(0, paneWidth - prefix.length);

  return padRight(`${prefix}${clip(category.title, labelWidth)}`, paneWidth);
}

function renderSettingsPaneRows(
  category: ConfigTuiCategory,
  _state: ResolvedConfigTuiViewState,
  paneWidth: number,
): string[] {
  const settings = category.settings;
  const rows = [renderSettingsHeader(category.title, settings.length, paneWidth)];

  if (settings.length === 0) {
    rows.push(padRight(clip("  No matching settings", paneWidth), paneWidth));
    return rows;
  }

  const end = Math.min(settings.length, MAX_VISIBLE_SETTING_ROWS);

  for (let index = 0; index < end; index += 1) {
    rows.push(renderSettingRow(settings[index], paneWidth));
    if (category.title === "What to fix") rows.push(...renderSettingDescriptionRows(settings[index], paneWidth));
  }

  return rows;
}

function renderSettingsHeader(title: string, settingCount: number, paneWidth: number): string {
  const counter = settingCountLabel(settingCount);
  const titleWidth = Math.max(0, paneWidth - counter.length - 1);
  const label = clip(title.toUpperCase(), titleWidth);
  const paddedLabel = padRight(label, titleWidth);

  return padRight(clip(`${paddedLabel} ${counter}`, paneWidth), paneWidth);
}

function renderSettingRow(setting: ConfigTuiSetting, paneWidth: number): string {
  const prefix = "  ";
  const valueWidth = Math.max(0, Math.min(28, Math.floor(paneWidth * 0.4)));
  const labelWidth = Math.max(1, paneWidth - prefix.length - 1 - valueWidth);
  const label = padRight(clip(setting.label, labelWidth), labelWidth);
  const value = padLeft(clipValue(setting.value, valueWidth), valueWidth);

  return padRight(clip(`${prefix}${label} ${value}`, paneWidth), paneWidth);
}

function renderSettingDescriptionRows(setting: ConfigTuiSetting, paneWidth: number): string[] {
  return wrapText(setting.description, Math.max(1, paneWidth - 2), 2).map((line) => padRight(clip(`  ${line}`, paneWidth), paneWidth));
}

function settingCountLabel(settingCount: number): string {
  if (settingCount === 1) return "1 item";

  return `${settingCount} items`;
}

function footerText(model: ConfigTuiModel, state: ResolvedConfigTuiViewState): string {
  const category = selectedCategory(model, state);
  const segments = footerLeadingSegments(state);

  segments.push(`${state.categoryIndex + 1}/${model.categories.length}`, category.description);
  return segments.join(FOOTER_SEPARATOR);
}

function footerLeadingSegments(state: ResolvedConfigTuiViewState): string[] {
  if (state.statusText) return [state.statusText];
  if (state.searchText) return [`Search: ${state.searchText}`];

  return [];
}

function resolveViewState(model: ConfigTuiModel, state: ConfigTuiViewState = {}): ResolvedConfigTuiViewState {
  const categoryIndex = clampIndex(state.categoryIndex ?? model.initialCategoryIndex, model.categories.length);

  return {
    focus: "categories",
    categoryIndex,
    settingIndexes: [],
    selectedSettingIndex: 0,
    narrowView: "settings",
    statusText: state.statusText,
    searchText: state.searchText,
  };
}

function selectedCategory(model: ConfigTuiModel, state: ResolvedConfigTuiViewState): ConfigTuiCategory {
  return model.categories[state.categoryIndex] ?? fallbackCategory();
}

function selectedSetting(model: ConfigTuiModel, state: ResolvedConfigTuiViewState): ConfigTuiSetting | undefined {
  return selectedCategory(model, state).settings[state.selectedSettingIndex];
}

function selectedSettingIndex(model: ConfigTuiModel, state: ResolvedConfigTuiViewState): number {
  const category = selectedCategory(model, state);
  return clampIndex(state.settingIndexes[state.categoryIndex] ?? 0, category.settings.length);
}

function fallbackCategory(): ConfigTuiCategory {
  return {
    title: "Status",
    description: "No configuration categories are available.",
    settings: [],
  };
}

function wideLeftPaneWidth(width: number): number {
  return Math.min(22, Math.max(16, Math.floor(width * 0.27)));
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

function wideSeparator(leftPaneWidth: number, rightPaneWidth: number, position: "top" | "bottom"): string {
  const divider = position === "top" ? "┬" : "┴";

  return `├${"─".repeat(leftPaneWidth)}${divider}${"─".repeat(rightPaneWidth)}┤`;
}

function narrowSeparator(width: number): string {
  if (width < 2) return clip("├", width);

  return `├${"─".repeat(width - 2)}┤`;
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

function wrapText(value: string, width: number, maxLines: number): string[] {
  const sanitized = sanitizeText(value);
  const words = sanitized.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= width) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;

    if (lines.length >= maxLines) break;
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  if (lines.length === 0) return [""];

  return lines;
}

function clip(value: string, width: number): string {
  const sanitized = sanitizeText(value);
  if (width <= 0) return "";
  if (sanitized.length <= width) return sanitized;
  if (width === 1) return "…";

  return `${sanitized.slice(0, width - 1)}…`;
}

function clipValue(value: string, width: number): string {
  if (looksPathLike(value)) return tailClip(value, width);

  return clip(value, width);
}

function tailClip(value: string, width: number): string {
  const sanitized = sanitizeText(value);
  if (width <= 0) return "";
  if (sanitized.length <= width) return sanitized;
  if (width === 1) return "…";

  return `…${sanitized.slice(-(width - 1))}`;
}

function looksPathLike(value: string): boolean {
  return value.includes("/") || value.includes("\\");
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

function padLeft(value: string, width: number): string {
  return value.padStart(Math.max(0, width), " ");
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index >= count) return count - 1;

  return index;
}

function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return count - 1;
  if (index >= count) return 0;

  return index;
}

function inputAction(data: string): ConfigTuiInputAction {
  if (data === "q" || data === "Q" || data === "\u0003" || data === "\u001b" || data === "escape") return "close";
  if (data === "\u001b[A" || data === "k" || data === "K") return "up";
  if (data === "\u001b[B" || data === "j" || data === "J") return "down";

  return "ignore";
}
