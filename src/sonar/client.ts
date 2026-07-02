import { normalizeSonarUrl } from "../config/load-config.ts";
import type { SonarConnectionConfig } from "../config/types.ts";
import { rethrowIfAbortError, throwIfAborted } from "../utils/abort.ts";
import { safeSonarText, safeSonarWarningText } from "../utils/text-safety.ts";

export type SonarQueryValue = string | number | boolean | undefined;
export type SonarFetch = typeof fetch;

export const DEFAULT_SONAR_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_SONAR_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export interface SonarClientRequest {
  path: string;
  query?: Record<string, SonarQueryValue>;
  organization?: string;
  signal?: AbortSignal;
}

export interface SonarClientOptions {
  fetch?: SonarFetch;
  requestTimeoutMs?: number;
  responseMaxBytes?: number;
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
  readonly requestTimeoutMs: number;
  readonly responseMaxBytes: number;

  constructor(config: SonarConnectionConfig, options: SonarClientOptions = {}) {
    this.config = { ...config, url: normalizeSonarUrl(config.url, { allowInsecureHttp: config.allowInsecureHttp }) };
    this.fetchImpl = options.fetch ?? fetch;
    this.requestTimeoutMs = normalizePositiveInteger(options.requestTimeoutMs, DEFAULT_SONAR_REQUEST_TIMEOUT_MS);
    this.responseMaxBytes = normalizePositiveInteger(options.responseMaxBytes, DEFAULT_SONAR_RESPONSE_MAX_BYTES);
  }

  async getJson<T>(request: SonarClientRequest): Promise<T> {
    const url = buildSonarApiUrl(this.config.url, request, { allowInsecureHttp: this.config.allowInsecureHttp });
    const abortContext = createSonarRequestAbortContext(request.signal, this.requestTimeoutMs);
    const readOptions = {
      abortContext,
      maxBytes: this.responseMaxBytes,
      path: request.path,
    };

    try {
      const response = await fetchSonarResponse(this.fetchImpl, url, this.config.token, abortContext);

      if (!response.ok) {
        const message = await buildHttpErrorMessage(response, request.path, this.config.token, readOptions);
        throw new SonarApiError(message, response.status, request.path);
      }

      return await readJsonResponse<T>(response, this.config.token, request.path, readOptions);
    } catch (error) {
      mapSonarRequestError(error, request.signal, abortContext, this.config.token, request.path);
    } finally {
      abortContext.dispose();
    }
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
  abortContext: SonarRequestAbortContext,
): Promise<Response> {
  throwIfAborted(abortContext.signal);

  return await raceWithSonarAbort(
    fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: createSonarAuthorizationHeader(token),
      },
      signal: abortContext.signal,
    }),
    abortContext,
  );
}

async function buildHttpErrorMessage(
  response: Response,
  path: string,
  token: string,
  readOptions: ResponseReadOptions,
): Promise<string> {
  const body = await safeReadResponseText(response, readOptions);
  const sonarMessage = extractSonarErrorMessage(body);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const message = sonarMessage ? `: ${sonarMessage}` : "";

  return safeSonarWarningText(`Sonar API request failed for ${path}: HTTP ${response.status}${statusText}${message}`, [token]);
}

async function readJsonResponse<T>(
  response: Response,
  token: string,
  path: string,
  readOptions: ResponseReadOptions,
): Promise<T> {
  const body = await readBoundedResponseText(response, { ...readOptions, bodyKind: "response body" });

  if (body.trim().length === 0) return undefined as T;

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    const message = `Sonar API returned invalid JSON for ${path}: ${errorMessage(error)}`;
    throw new SonarApiError(safeSonarWarningText(message, [token]), response.status, path);
  }
}

async function safeReadResponseText(response: Response, readOptions: ResponseReadOptions): Promise<string> {
  try {
    return await readBoundedResponseText(response, { ...readOptions, bodyKind: "error body" });
  } catch (error) {
    if (error instanceof SonarApiError || readOptions.abortContext.signal.aborted) throw error;
    return "";
  }
}

type ResponseBodyKind = "response body" | "error body";

interface SonarRequestAbortContext {
  readonly signal: AbortSignal;
  readonly abortPromise: Promise<never>;
  readonly timeoutMs: number;
  readonly timedOut: boolean;
  dispose(): void;
}

interface ResponseReadOptions {
  readonly abortContext: SonarRequestAbortContext;
  readonly maxBytes: number;
  readonly path: string;
}

interface BoundedResponseReadOptions extends ResponseReadOptions {
  readonly bodyKind: ResponseBodyKind;
}

async function readBoundedResponseText(response: Response, options: BoundedResponseReadOptions): Promise<string> {
  const contentLength = parseContentLength(response.headers.get("content-length"));

  if (contentLength !== undefined && contentLength > options.maxBytes) {
    throw createResponseBodyTooLargeError(response, options);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const textParts: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      throwIfAborted(options.abortContext.signal);
      const chunk = await raceWithSonarAbort(reader.read(), options.abortContext);

      if (chunk.done) break;

      totalBytes += chunk.value.byteLength;
      if (totalBytes > options.maxBytes) {
        await cancelResponseReader(reader);
        throw createResponseBodyTooLargeError(response, options);
      }

      textParts.push(decoder.decode(chunk.value, { stream: true }));
    }

    const remainingText = decoder.decode();
    if (remainingText.length > 0) textParts.push(remainingText);

    return textParts.join("");
  } finally {
    reader.releaseLock();
  }
}

async function cancelResponseReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Ignore cancellation failures because the caller is already failing the request safely.
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function createResponseBodyTooLargeError(response: Response, options: BoundedResponseReadOptions): SonarApiError {
  const statusText = response.status > 0 ? ` HTTP ${response.status}` : "";
  const message = `Sonar API ${options.bodyKind} for ${options.path}${statusText} exceeded the ${options.maxBytes} byte limit before parsing.`;

  return new SonarApiError(message, response.status, options.path);
}

function createSonarRequestAbortContext(
  callerSignal: AbortSignal | undefined,
  requestTimeoutMs: number,
): SonarRequestAbortContext {
  const timeoutMs = normalizePositiveInteger(requestTimeoutMs, DEFAULT_SONAR_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  let didTimeout = false;
  let rejectAbortPromise: ((reason: unknown) => void) | undefined;

  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbortPromise = reject;
  });
  abortPromise.catch(() => undefined);
  const handleRequestAbort = (): void => {
    rejectAbortPromise?.(abortReason(controller.signal));
  };
  const handleCallerAbort = (): void => {
    if (controller.signal.aborted) return;
    controller.abort(abortReason(callerSignal));
  };
  const handleTimeout = (): void => {
    if (controller.signal.aborted) return;
    didTimeout = true;
    controller.abort(createSonarTimeoutError(timeoutMs));
  };

  controller.signal.addEventListener("abort", handleRequestAbort, { once: true });

  if (callerSignal?.aborted) {
    handleCallerAbort();
  } else {
    callerSignal?.addEventListener("abort", handleCallerAbort, { once: true });
  }

  const timeoutId = setTimeout(handleTimeout, timeoutMs);

  return {
    signal: controller.signal,
    abortPromise,
    timeoutMs,
    get timedOut() {
      return didTimeout;
    },
    dispose() {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", handleCallerAbort);
      controller.signal.removeEventListener("abort", handleRequestAbort);
    },
  };
}

function raceWithSonarAbort<T>(promise: Promise<T>, abortContext: SonarRequestAbortContext): Promise<T> {
  return Promise.race([promise, abortContext.abortPromise]);
}

function mapSonarRequestError(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  abortContext: SonarRequestAbortContext,
  token: string,
  path: string,
): never {
  if (error instanceof SonarApiError) throw error;
  if (callerSignal?.aborted) rethrowIfAbortError(error, callerSignal);

  if (abortContext.timedOut) {
    const message = `Sonar API request timed out after ${abortContext.timeoutMs} ms for ${path}. Check Sonar availability and network connectivity.`;
    throw new SonarApiError(safeSonarWarningText(message, [token]), undefined, path);
  }

  throw new SonarApiError(safeSonarWarningText(`Sonar request failed: ${errorMessage(error)}`, [token]), undefined, path);
}

function abortReason(signal: AbortSignal | undefined): unknown {
  if (signal?.reason !== undefined) return signal.reason;

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function createSonarTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Sonar API request timed out after ${timeoutMs} ms.`);
  error.name = "TimeoutError";
  return error;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;

  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;

  return normalized;
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
