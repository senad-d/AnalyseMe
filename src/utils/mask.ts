export const MASKED_PRESENT_VALUE = "present";
export const MASKED_MISSING_VALUE = "not set";

export function hasSecretValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function maskSecretPresence(value: string | undefined): string {
  return hasSecretValue(value) ? MASKED_PRESENT_VALUE : MASKED_MISSING_VALUE;
}

export function maskSecretTail(value: string | undefined): string {
  if (!hasSecretValue(value)) return MASKED_MISSING_VALUE;

  const trimmed = value.trim();
  if (trimmed.length <= 4) return MASKED_PRESENT_VALUE;

  return `present (…${trimmed.slice(-4)})`;
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let redacted = text;

  for (const secret of secrets) {
    if (!hasSecretValue(secret)) continue;
    redacted = redacted.split(secret.trim()).join("[redacted]");
  }

  return redacted;
}
