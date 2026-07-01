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
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(calls[0].init.headers.Authorization, createSonarAuthorizationHeader("secret-token"));
  assert.doesNotMatch(calls[0].url, /secret-token/);
});

test("maps HTTP errors and redacts token values", async () => {
  const { fetchImpl } = createCapturingFetch(
    createJsonResponse({ errors: [{ msg: "Bad token secret-token" }] }, { status: 401, statusText: "Unauthorized" }),
  );
  const client = createSonarClient(createConfig(), { fetch: fetchImpl });

  await assert.rejects(
    client.getJson({ path: "/api/issues/search" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.equal(error.status, 401);
      assert.match(error.message, /HTTP 401 Unauthorized/);
      assert.match(error.message, /Bad token \[redacted\]/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
});

test("maps fetch failures and redacts token values", async () => {
  const client = createSonarClient(createConfig(), {
    fetch: createRejectingFetch(new Error("Connection failed with secret-token")),
  });

  await assert.rejects(
    client.getJson({ path: "/api/measures/component" }),
    (error) => {
      assert.ok(error instanceof SonarApiError);
      assert.match(error.message, /Connection failed with \[redacted\]/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
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
