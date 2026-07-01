import { redactSecrets } from "./mask.ts";

export interface SonarTextSafetyResult {
  text: string;
  metadata: {
    truncated: boolean;
    originalChars: number;
    outputChars: number;
  };
}

export interface SonarTextSafetySummary {
  truncatedFields: number;
  fieldTruncationNotice: string;
}

export const SONAR_IDENTIFIER_TEXT_MAX_CHARS = 512;
export const SONAR_SHORT_TEXT_MAX_CHARS = 1_000;
export const SONAR_MEDIUM_TEXT_MAX_CHARS = 2_000;
export const SONAR_LONG_TEXT_MAX_CHARS = 8_000;
export const SONAR_WARNING_TEXT_MAX_CHARS = 2_000;

export const SONAR_FIELD_TRUNCATION_NOTICE = "[AnalyseMe field truncated";

/* eslint-disable no-control-regex */
const ANSI_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  "\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)|[PX^_][\\s\\S]*?\\u001B\\\\|[@-Z\\\\-_])|\\u009B[0-?]*[ -/]*[@-~]",
  "g",
);
/* eslint-enable no-control-regex */

export function sanitizeSonarText(value: string): string {
  const withoutAnsi = value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "");
  const normalizedLineEndings = withoutAnsi.replace(/\r\n?/g, "\n");
  let sanitized = "";

  for (const character of normalizedLineEndings) {
    if (isUnsafeControlCharacter(character)) continue;
    sanitized += character;
  }

  return sanitized;
}

export function safeSonarText(value: string, maxChars: number = SONAR_MEDIUM_TEXT_MAX_CHARS): SonarTextSafetyResult {
  const sanitized = sanitizeSonarText(value);
  const normalizedMaxChars = Math.max(1, Math.trunc(maxChars));

  if (sanitized.length <= normalizedMaxChars) {
    return {
      text: sanitized,
      metadata: {
        truncated: false,
        originalChars: sanitized.length,
        outputChars: sanitized.length,
      },
    };
  }

  const text = truncateWithNotice(sanitized, normalizedMaxChars);

  return {
    text,
    metadata: {
      truncated: true,
      originalChars: sanitized.length,
      outputChars: text.length,
    },
  };
}

export function safeSonarString(value: unknown, maxChars: number = SONAR_MEDIUM_TEXT_MAX_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;

  const text = safeSonarText(value, maxChars).text;
  return text.trim().length > 0 ? text : undefined;
}

export function safeSonarWarningText(value: string, secrets: readonly string[] = []): string {
  const sanitized = sanitizeSonarText(value);
  const redacted = redactSecrets(sanitized, [...secrets]);

  return safeSonarText(redacted, SONAR_WARNING_TEXT_MAX_CHARS).text;
}

export function summarizeSonarTextSafety(value: unknown): SonarTextSafetySummary {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  let truncatedFields = 0;

  while (stack.length > 0) {
    const current = stack.pop();

    if (typeof current === "string") {
      if (current.includes(SONAR_FIELD_TRUNCATION_NOTICE)) truncatedFields += 1;
      continue;
    }

    if (typeof current !== "object" || current === null) continue;
    if (seen.has(current)) continue;

    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    stack.push(...Object.values(current));
  }

  return {
    truncatedFields,
    fieldTruncationNotice: SONAR_FIELD_TRUNCATION_NOTICE,
  };
}

function truncateWithNotice(value: string, maxChars: number): string {
  const notice = `\n[AnalyseMe field truncated: kept ${maxChars} of ${value.length} characters.]`;

  if (notice.length >= maxChars) {
    return value.slice(0, Math.max(0, maxChars - 1)) + "…";
  }

  return value.slice(0, maxChars - notice.length) + notice;
}

function isUnsafeControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint === 9 || codePoint === 10) return false;
  if (codePoint < 32 || codePoint === 127) return true;

  return codePoint >= 128 && codePoint <= 159;
}
