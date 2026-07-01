import { normalizeSonarUrl } from "../config/load-config.ts";
import type { SonarConnectionConfig } from "../config/types.ts";
import { rethrowIfAbortError } from "../utils/abort.ts";
import { safeSonarText, safeSonarWarningText } from "../utils/text-safety.ts";

export type SonarQueryValue = string | number | boolean | undefined;
export type SonarFetch = typeof fetch;

export interface SonarClientRequest {
  path: string;
  query?: Record<string, SonarQueryValue>;
  organization?: string;
  signal?: AbortSignal;
}

export interface SonarClientOptions {
  fetch?: SonarFetch;
}

export interface SonarClient {
  readonly config: SonarConnectionConfig;
  getJson<T>(request: SonarClientRequest): Promise<T>;
}

export class SonarApiError extends Error {
  readonly status?: number;
  readonly path?: string;

  constructor(message: string, status?: number, path?: string) {
    super(message);
    this.name = "SonarApiError";
    this.status = status;
    this.path = path;
  }
}

export class HttpSonarClient implements SonarClient {
  readonly config: SonarConnectionConfig;
  readonly fetchImpl: SonarFetch;

  constructor(config: SonarConnectionConfig, options: SonarClientOptions = {}) {
    this.config = { ...config, url: normalizeSonarUrl(config.url, { allowInsecureHttp: config.allowInsecureHttp }) };
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getJson<T>(request: SonarClientRequest): Promise<T> {
    const url = buildSonarApiUrl(this.config.url, request, { allowInsecureHttp: this.config.allowInsecureHttp });
    const response = await fetchSonarResponse(this.fetchImpl, url, this.config.token, request.signal);

    if (!response.ok) {
      const message = await buildHttpErrorMessage(response, request.path, this.config.token);
      throw new SonarApiError(message, response.status, request.path);
    }

    return readJsonResponse<T>(response, this.config.token, request.path);
  }
}

export function createSonarClient(config: SonarConnectionConfig, options: SonarClientOptions = {}): SonarClient {
  return new HttpSonarClient(config, options);
}

export function buildSonarApiUrl(
  baseUrl: string,
  request: SonarClientRequest,
  options: { allowInsecureHttp?: boolean } = {},
): string {
  const normalizedBaseUrl = normalizeSonarUrl(baseUrl, options);
  const normalizedPath = normalizeRequestPath(request.path);
  const base = new URL(`${normalizedBaseUrl}/`);
  const url = new URL(normalizedPath, base);
  const query = withRequestOrganization(request.query ?? {}, request.organization);

  if (url.origin !== base.origin) {
    throw new SonarApiError("Sonar API request path must stay relative to the configured Sonar URL.");
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function createSonarAuthorizationHeader(token: string): string {
  const credentials = `${token}:`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}

function normalizeRequestPath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    throw new SonarApiError("Sonar API request path is empty.");
  }

  if (isExternallyRootedRequestPath(trimmed)) {
    throw new SonarApiError("Sonar API request path must be relative to the configured Sonar URL.");
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isExternallyRootedRequestPath(path: string): boolean {
  const normalizedPrefix = path.slice(0, 2).replaceAll("\\", "/");

  return normalizedPrefix === "//" || /^[A-Za-z][A-Za-z\d+.-]*:/.test(path);
}

function withRequestOrganization(
  query: Record<string, SonarQueryValue>,
  organization: string | undefined,
): Record<string, SonarQueryValue> {
  if (!organization) return query;

  return { ...query, organization };
}

async function fetchSonarResponse(
  fetchImpl: SonarFetch,
  url: string,
  token: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: createSonarAuthorizationHeader(token),
      },
      signal,
    });
  } catch (error) {
    rethrowIfAbortError(error, signal);
    throw new SonarApiError(safeSonarWarningText(`Sonar request failed: ${errorMessage(error)}`, [token]));
  }
}

async function buildHttpErrorMessage(response: Response, path: string, token: string): Promise<string> {
  const body = await safeReadResponseText(response);
  const sonarMessage = extractSonarErrorMessage(body);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const message = sonarMessage ? `: ${sonarMessage}` : "";

  return safeSonarWarningText(`Sonar API request failed for ${path}: HTTP ${response.status}${statusText}${message}`, [token]);
}

async function readJsonResponse<T>(response: Response, token: string, path: string): Promise<T> {
  const body = await response.text();

  if (body.trim().length === 0) return undefined as T;

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    const message = `Sonar API returned invalid JSON for ${path}: ${errorMessage(error)}`;
    throw new SonarApiError(safeSonarWarningText(message, [token]), response.status, path);
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function extractSonarErrorMessage(body: string): string | undefined {
  if (body.trim().length === 0) return undefined;

  try {
    return extractSonarErrorMessageFromJson(JSON.parse(body));
  } catch {
    return truncateErrorBody(body);
  }
}

function extractSonarErrorMessageFromJson(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;

  const errors = payload.errors;
  if (Array.isArray(errors)) return joinSonarErrorMessages(errors);

  const message = payload.message;
  return typeof message === "string" ? safeSonarText(message).text : undefined;
}

function joinSonarErrorMessages(errors: unknown[]): string | undefined {
  const messages: string[] = [];

  for (const error of errors) {
    if (!isRecord(error)) continue;
    if (typeof error.msg === "string") messages.push(error.msg);
    if (typeof error.message === "string") messages.push(error.message);
  }

  return messages.length > 0 ? safeSonarText(messages.join("; ")).text : undefined;
}

function truncateErrorBody(body: string): string {
  const singleLineBody = safeSonarText(body.replaceAll(/\s+/g, " ").trim(), 300).text;
  if (singleLineBody.length <= 300) return singleLineBody;

  return `${singleLineBody.slice(0, 297)}...`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
