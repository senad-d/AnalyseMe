import assert from "node:assert/strict";
import test from "node:test";

import {
  SonarApiError,
  buildSonarApiUrl,
  createSonarAuthorizationHeader,
  createSonarClient,
} from "../src/sonar/client.ts";

function createConfig(token = "secret-token") {
  return {
    url: "https://sonar.example.com///",
    token,
    tokenDisplay: "present",
    sources: {},
  };
}

function createJsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createTextResponse(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createCapturingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response;
  };

  return { calls, fetchImpl };
}

function createRejectingFetch(error) {
  return async () => {
    throw error;
  };
}

function createNeverSettlingFetch() {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return new Promise(() => {});
  };

  return { calls, fetchImpl };
}

function createCredentialEchoes(token) {
  const basicCredential = `${token}:`;
  const basicPayload = Buffer.from(basicCredential, "utf8").toString("base64");
  const authorizationHeader = `Basic ${basicPayload}`;

  return {
    rawToken: token,
    basicCredential,
    basicPayload,
    authorizationHeader,
    encodedToken: encodeURIComponent(token),
    encodedCredential: encodeURIComponent(basicCredential),
    encodedAuthorizationHeader: encodeURIComponent(authorizationHeader),
  };
}

function assertNoCredentialEchoes(text, echoes) {
  for (const echo of new Set(Object.values(echoes))) {
    assert.equal(text.includes(echo), false, `leaked credential echo: ${echo}`);
  }
}

test("builds Sonar API URLs with normalized base, query parameters, and organization", () => {
  const url = buildSonarApiUrl("https://sonar.example.com///", {
    path: "api/issues/search",
    organization: "my-org",
    query: {
      componentKeys: "project:key",
      p: 2,
      resolved: false,
      ignored: undefined,
    },
  });

  assert.equal(
    url,
    "https://sonar.example.com/api/issues/search?componentKeys=project%3Akey&p=2&resolved=false&organization=my-org",
  );
});

test("uses abort-aware GET fetch with token auth and JSON parsing", async () => {
  const controller = new AbortController();
  const { calls, fetchImpl } = createCapturingFetch(createJsonResponse({ projectStatus: { status: "OK" } }));
  const client = createSonarClient(createConfig(), { fetch: fetchImpl });
  const result = await client.getJson({ path: "/api/qualitygates/project_status", query: { projectKey: "demo" }, signal: controller.signal });

  assert.deepEqual(result, { projectStatus: { status: "OK" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://sonar.example.com/api/qualitygates/project_status?projectKey=demo");
  assert.equal(calls[0].init.method, "GET");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.signal.aborted, false);
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(calls[0].init.headers.Authorization, createSonarAuthorizationHeader("secret-token"));
  assert.doesNotMatch(calls[0].url, /secret-token/);
});

test("maps HTTP errors and redacts raw and derived token values", async () => {
  const token = "secret token+value";
  const echoes = createCredentialEchoes(token);
  const message = Object.values(echoes).join(" ");
  const { fetchImpl } = createCapturingFetch(
    createJsonResponse({ errors: [{ msg: `Bad token ${message}` }] }, { status: 401, statusText: "Unauthorized" }),
  );
  const client = createSonarClient(createConfig(token), { fetch: fetchImpl });

  await assert.rejects(
    client.getJson({ path: "/api/issues/search" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.equal(error.status, 401);
      assert.match(error.message, /HTTP 401 Unauthorized/);
      assert.match(error.message, /Bad token \[redacted\]/);
      assertNoCredentialEchoes(error.message, echoes);
      return true;
    },
  );
});

test("maps fetch failures and redacts raw and derived token values", async () => {
  const token = "secret token+value";
  const echoes = createCredentialEchoes(token);
  const client = createSonarClient(createConfig(token), {
    fetch: createRejectingFetch(new Error(`Connection failed with ${Object.values(echoes).join(" ")}`)),
  });

  await assert.rejects(
    client.getJson({ path: "/api/measures/component" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.match(error.message, /Connection failed with \[redacted\]/);
      assertNoCredentialEchoes(error.message, echoes);
      return true;
    },
  );
});

test("rejects oversized success bodies before JSON parsing without exposing credentials", async () => {
  const token = "secret-token";
  const authorizationHeader = createSonarAuthorizationHeader(token);
  const body = JSON.stringify({ value: `${token} ${authorizationHeader} ${"x".repeat(200)}` });
  const { fetchImpl } = createCapturingFetch(createTextResponse(body));
  const client = createSonarClient(createConfig(token), { fetch: fetchImpl, responseMaxBytes: 64 });

  await assert.rejects(
    client.getJson({ path: "/api/issues/search" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.equal(error.status, 200);
      assert.match(error.message, /response body/);
      assert.match(error.message, /64 byte limit/);
      assert.doesNotMatch(error.message, /secret-token/);
      assert.doesNotMatch(error.message, new RegExp(authorizationHeader));
      return true;
    },
  );
});

test("rejects oversized error bodies before rendering without exposing credentials", async () => {
  const token = "secret-token";
  const authorizationHeader = createSonarAuthorizationHeader(token);
  const body = JSON.stringify({ errors: [{ msg: `${token} ${authorizationHeader} ${"x".repeat(200)}` }] });
  const { fetchImpl } = createCapturingFetch(createTextResponse(body, { status: 503, statusText: "Service Unavailable" }));
  const client = createSonarClient(createConfig(token), { fetch: fetchImpl, responseMaxBytes: 64 });

  await assert.rejects(
    client.getJson({ path: "/api/issues/search" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.equal(error.status, 503);
      assert.match(error.message, /error body/);
      assert.match(error.message, /HTTP 503/);
      assert.match(error.message, /64 byte limit/);
      assert.doesNotMatch(error.message, /secret-token/);
      assert.doesNotMatch(error.message, new RegExp(authorizationHeader));
      return true;
    },
  );
});

test("times out slow requests with an actionable Sonar API error", async () => {
  const { calls, fetchImpl } = createNeverSettlingFetch();
  const client = createSonarClient(createConfig(), { fetch: fetchImpl, requestTimeoutMs: 10 });

  await assert.rejects(
    client.getJson({ path: "/api/issues/search" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.match(error.message, /timed out after 10 ms/);
      assert.match(error.message, /Check Sonar availability/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.signal.aborted, true);
});

test("preserves caller aborts instead of converting them to Sonar API timeouts", async () => {
  const controller = new AbortController();
  const { calls, fetchImpl } = createNeverSettlingFetch();
  const client = createSonarClient(createConfig(), { fetch: fetchImpl, requestTimeoutMs: 1_000 });

  controller.abort(new Error("caller stopped"));

  await assert.rejects(
    client.getJson({ path: "/api/issues/search", signal: controller.signal }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof SonarApiError));
      assert.equal(error.message, "caller stopped");
      return true;
    },
  );

  assert.equal(calls.length, 0);
});

test("rejects externally rooted request paths to keep calls bound to configured Sonar URL", () => {
  const rejectedPaths = [
    "https://evil.example.com/api/issues/search",
    "http://evil.example.com/api/issues/search",
    "ftp://evil.example.com/api/issues/search",
    "//evil.example.com/api/issues/search",
    "  //evil.example.com/api/issues/search  ",
  ];

  for (const path of rejectedPaths) {
    assert.throws(() => buildSonarApiUrl("https://sonar.example.com", { path }), SonarApiError);
  }
});

test("rejects protocol-relative request paths before fetch and authorization headers", async () => {
  const { calls, fetchImpl } = createCapturingFetch(createJsonResponse({}));
  const client = createSonarClient(createConfig(), { fetch: fetchImpl });

  await assert.rejects(client.getJson({ path: "//evil.example.com/api/issues/search" }), SonarApiError);
  assert.equal(calls.length, 0);
});
