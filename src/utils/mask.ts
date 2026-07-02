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
  const variants = redactionVariants(secrets);

  for (const secret of variants) {
    redacted = redacted.split(secret).join("[redacted]");
  }

  return redacted;
}

function redactionVariants(secrets: Array<string | undefined>): string[] {
  const variants = new Set<string>();

  for (const secret of secrets) {
    addSecretRedactionVariants(variants, secret);
  }

  return [...variants].sort((first, second) => second.length - first.length);
}

function addSecretRedactionVariants(variants: Set<string>, secret: string | undefined): void {
  if (!hasSecretValue(secret)) return;

  const trimmed = secret.trim();
  const basicCredential = `${trimmed}:`;
  const basicPayload = Buffer.from(basicCredential, "utf8").toString("base64");
  const authorizationHeaderValue = `Basic ${basicPayload}`;

  variants.add(trimmed);
  variants.add(basicCredential);
  variants.add(basicPayload);
  variants.add(authorizationHeaderValue);
  addEncodedSecretRedactionVariant(variants, trimmed);
  addEncodedSecretRedactionVariant(variants, basicCredential);
  addEncodedSecretRedactionVariant(variants, basicPayload);
  addEncodedSecretRedactionVariant(variants, authorizationHeaderValue);
}

function addEncodedSecretRedactionVariant(variants: Set<string>, value: string): void {
  try {
    variants.add(encodeURIComponent(value));
  } catch {
    // Ignore malformed URI sequences in secret material; raw and Basic-derived variants still get redacted.
  }
}
